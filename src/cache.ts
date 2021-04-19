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
}

export function buildKeys(...keys: (string | mongoose.ObjectId)[]) {
  return keys.map((k) => (typeof k === 'object' ? k.toString() : k)).join(':')
}

export function setupCache<
  D extends Document<any, {}> = Document<any, {}>,
  T extends SchemaType<D> = SchemaType<D>
>(schema: T, cache: Cacher, option: Option) {
  const sf = new Singleflight()

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
      option.expire,
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
            option.expire + cacheSafeGapBetweenIndexAndPrimary
          )

          return doc._id.toString()
        },
        option.expire,
        'raw'
      )

      return doc
    })
  }

  schema.statics.mcUpdateOne = async function (doc: D) {
    if (option.disable) {
      return this.updateOne({ _id: doc._id }, doc)
    }

    const delKeys: string[] = [
      buildKeys(this.collection.collectionName, '_id', doc._id),
    ]
    option.uniqueFields.forEach((f) => {
      delKeys.push(
        buildKeys(this.collection.collectionName, f, (doc as any)[f])
      )
    })
    const resp = await this.updateOne({ _id: doc._id }, doc)
    d(`mcUpdateOne update doc _id: ${doc._id}, delete cache`, delKeys)
    cache.delete(...delKeys)
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
    const delKeys: string[] = [
      buildKeys(this.collection.collectionName, '_id', doc._id),
    ]
    option.uniqueFields.forEach((f) => {
      delKeys.push(
        buildKeys(this.collection.collectionName, f, (doc as any)[f])
      )
    })
    d(`mcDeleteById delete doc _id: ${doc._id}, delete cache`, delKeys)
    cache.delete(...delKeys)
    return resp
  }
}
