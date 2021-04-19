export * from './cache'

declare module 'mongoose' {
  interface Model<T extends Document, TQueryHelpers = {}> {
    mcFindById(id: string | ObjectId): Promise<T>
    mcFindByUniqueKey(id: string | ObjectId, field: string): Promise<T>
    mcUpdateOne(D: T): Promise<any>
    mcDeleteById(id: string | ObjectId): Promise<any>
    mcDeleteDocCache(D: T): Promise<void>
  }
}
