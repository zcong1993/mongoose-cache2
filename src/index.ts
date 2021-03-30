export * from './cache'

declare module 'mongoose' {
  interface Model<T extends Document, TQueryHelpers = {}> {
    cacheFindById(id: string | ObjectId): Promise<T>
    cacheFindByUniqueKey(id: string | ObjectId, field: string): Promise<T>
    cacheUpdateOne(D: T): Promise<any>
    cacheDeleteById(id: string | ObjectId): Promise<any>
  }
}
