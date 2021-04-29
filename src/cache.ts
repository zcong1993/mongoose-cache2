import * as debug from 'debug'
import * as mongoose from 'mongoose'
import { Singleflight } from '@zcong/singleflight'
import { Cacher } from '@zcong/node-redis-cache'
import type { Document, Schema as SchemaType } from 'mongoose'

const cacheSafeGapBetweenIndexAndPrimary = 5
const d = debug('mongoose-cache')

export interface Option {
  expire: number
  uniqueFields: string[]
  disable?: boolean
  /**
   * @default 0.05
   * make the expiry unstable to avoid lots of cached items expire at the same time
   * 0.05 means make the unstable expiry to be [0.95, 1.05] * seconds
   * should in range [0, 1]
   * default 0.05, set 0 to disable
   */
  expiryDeviation?: number
}

export function fixOption(option: Option) {
  if (!option.expiryDeviation) {
    option.expiryDeviation = 0.05
  }

  if (option.expiryDeviation < 0) {
    option.expiryDeviation = 0
  }

  if (option.expiryDeviation > 1) {
    option.expiryDeviation = 1
  }
}

export function aroundExpire(expire: number, expiryDeviation: number) {
  return Math.floor(
    expire * (1 - expiryDeviation + 2 * expiryDeviation * Math.random())
  )
}

export function buildKeys(...keys: (string | mongoose.ObjectId)[]) {
  return keys.map((k) => (typeof k === 'object' ? k.toString() : k)).join(':')
}

export function setupCache<
  D extends Document<any, {}> = Document<any, {}>,
  T extends SchemaType<D> = SchemaType<D>
>(schema: T, cache: Cacher, option: Option) {
  const sf = new Singleflight()

  fixOption(option)

  const aroundExpire2 = (expire: number) =>
    aroundExpire(expire, option.expiryDeviation)

  schema.statics.mcFindById = async function (id: string | mongoose.ObjectId) {
    if (option.disable) {
      return (await this.findById(id))?.toObject() || null
    }

    const key = buildKeys(this.collection.collectionName, '_id', id)
    return cache.cacheFn(
      key,
      async () => {
        d(`mcFindById call db, _id: ${id}`)
        return (await this.findById(id))?.toObject() || null
      },
      aroundExpire2(option.expire),
      'json'
    )
  }

  schema.statics.mcFindByUniqueKey = async function (
    id: string | mongoose.ObjectId,
    field: string
  ) {
    if (!option.uniqueFields.includes(field)) {
      throw new Error('invalid field')
    }

    if (option.disable) {
      return (await this.findOne({ [field]: id }))?.toObject() || null
    }

    const key = buildKeys(this.collection.collectionName, field, id)

    return sf.do(`${key}-outer`, async () => {
      const [val, isNotFoundPlaceHolder] = await cache.get(key, 'raw')

      if (isNotFoundPlaceHolder) {
        d(
          `mcFindByUniqueKey hit not found placeholder, field: ${field} id: ${id}`
        )
        return null
      }

      if (val) {
        d(
          `mcFindByUniqueKey found _id in cache, field: ${field} id: ${id}, _id: ${val}`
        )
        return (this as any).mcFindById(val)
      }

      let doc: any = null
      await cache.cacheFn(
        key,
        async () => {
          d(`mcFindByUniqueKey call db, field: ${field} id: ${id}`)
          doc = (await this.findOne({ [field]: id }))?.toObject() || null
          if (!doc) {
            return null
          }

          await cache.set(
            buildKeys(this.collection.collectionName, '_id', doc._id),
            doc,
            aroundExpire2(option.expire + cacheSafeGapBetweenIndexAndPrimary)
          )

          return doc._id.toString()
        },
        aroundExpire2(option.expire),
        'raw'
      )

      return doc
    })
  }

  schema.statics.mcUpdateOne = async function (doc: D) {
    if (option.disable) {
      return this.updateOne({ _id: doc._id }, doc)
    }
    const resp = await this.updateOne({ _id: doc._id }, doc)
    d(`mcUpdateOne update doc _id: ${doc._id}`)
    ;(this as any).mcDeleteDocCache(doc)
    return resp
  }

  schema.statics.mcDeleteById = async function (
    id: string | mongoose.ObjectId
  ) {
    if (option.disable) {
      return this.deleteOne({ _id: id })
    }

    const doc = await (this as any).mcFindById(id)
    if (!doc) {
      return
    }
    const resp = await this.deleteOne({ _id: id })
    d(`mcDeleteById delete doc _id: ${doc._id}`)
    ;(this as any).mcDeleteDocCache(doc)
    return resp
  }

  schema.statics.mcDeleteDocCache = async function (doc: D) {
    if (option.disable) {
      return
    }

    const delKeys: string[] = [
      buildKeys(this.collection.collectionName, '_id', doc._id),
    ]

    option.uniqueFields.forEach((f) => {
      delKeys.push(
        buildKeys(this.collection.collectionName, f, (doc as any)[f])
      )
    })

    d(
      `mcDeleteDocCache delete doc cache, _id: ${doc._id}, deleted cacheKeys`,
      delKeys
    )
    await cache.delete(...delKeys)
  }
}
