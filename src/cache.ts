import * as mongoose from 'mongoose'
import * as debug from 'debug'
import { RedisCache } from '@zcong/node-redis-cache'
import type { Document, Schema as SchemaType } from 'mongoose'

const cacheSafeGapBetweenIndexAndPrimary = 5
const d = debug('mongoose-cache')

export interface Option {
  expire: number
  uniqueFields: string[]
}

export function buildKeys(...keys: (string | mongoose.ObjectId)[]) {
  return keys.map((k) => (typeof k === 'object' ? k.toString() : k)).join(':')
}

export function setupCache<
  D extends Document<any, {}> = Document<any, {}>,
  T extends SchemaType<D> = SchemaType<D>
>(schema: T, cache: RedisCache, option: Option) {
  schema.statics.cacheFindById = async function (
    id: string | mongoose.ObjectId
  ) {
    const key = buildKeys(this.collection.collectionName, '_id', id)
    return cache.cacheFn(
      key,
      async () => {
        d(`cacheFindById call db, _id: ${id}`)
        return this.findById(id)
      },
      option.expire
    )
  }

  schema.statics.cacheFindByUniqueKey = async function (
    id: string | mongoose.ObjectId,
    field: string
  ) {
    if (!option.uniqueFields.includes(field)) {
      throw new Error('invalid field')
    }

    const key = buildKeys(this.collection.collectionName, field, id)
    const [val, isNotFoundPlaceHolder] = await cache.get(key, 'raw')

    if (isNotFoundPlaceHolder) {
      d(
        `cacheFindByUniqueKey hit not found placeholder, field: ${field} id: ${id}`
      )
      return null
    }

    if (val) {
      d(
        `cacheFindByUniqueKey found _id in cache, field: ${field} id: ${id}, _id: ${val}`
      )
      return (this as any).cacheFindById(val)
    }

    let doc: any = null

    await cache.cacheFn(
      key,
      async () => {
        d(`cacheFindByUniqueKey call db, field: ${field} id: ${id}`)
        doc = await this.findOne({ [field]: id })
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
  }

  schema.statics.cacheUpdateOne = async function (doc: D) {
    const delKeys: string[] = [
      buildKeys(this.collection.collectionName, '_id', doc._id),
    ]
    option.uniqueFields.forEach((f) => {
      delKeys.push(
        buildKeys(this.collection.collectionName, f, (doc as any)[f])
      )
    })
    const resp = await this.updateOne({ _id: doc._id }, doc)
    d(`cacheUpdateOne update doc _id: ${doc._id}, delete cache`, delKeys)
    cache.delete(...delKeys)
    return resp
  }

  schema.statics.cacheDeleteById = async function (
    id: string | mongoose.ObjectId
  ) {
    const doc = await (this as any).cacheFindById(id)
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
    d(`cacheDeleteById delete doc _id: ${doc._id}, delete cache`, delKeys)
    cache.delete(...delKeys)
    return resp
  }
}
