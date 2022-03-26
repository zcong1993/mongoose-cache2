import { RedisCache } from '@zcong/node-redis-cache'
import Redis from 'ioredis'
import * as mongoose from 'mongoose'
import { aroundExpire, CacheModel, fixOption, Option, setupCache } from '../src'

const { Schema } = mongoose

const repeatCall = (n: number, fn: Function) =>
  Promise.all(
    Array(n)
      .fill(null)
      .map((_) => fn())
  )

mongoose.connect('mongodb://localhost/test')

interface ITest {
  studentCode: string
  name: string
  age: number
  desc: string
}

const TestSchema = new Schema<ITest>({
  studentCode: {
    type: String,
    unique: true,
  },
  name: String,
  age: Number,
  desc: String,
})

const redis = new Redis()

afterAll(async () => {
  redis.disconnect()
  await mongoose.connection.close()
}, 10000)

setupCache(TestSchema, new RedisCache({ redis, prefix: 'mongoose' }), {
  expire: 5,
  uniqueFields: ['studentCode'],
  expiryDeviation: 0.04,
})

const Test = mongoose.model<ITest, CacheModel<ITest>>('Test', TestSchema)

const setupData = async (): Promise<[any, any]> => {
  const doc = await Test.create({
    studentCode: `a-${Date.now()}`,
    name: 'test1',
    age: 18,
    desc: 'haha',
  })

  return [doc.toJSON(), () => Test.deleteOne({ _id: doc._id })]
}

const objSort = (obj: any) => {
  if (!obj) {
    return obj
  }
  const res: any = {}
  Object.keys(obj)
    .sort()
    .forEach((k) => {
      res[k] = obj[k]
    })
  return res
}

const expectDocument = (expectedVal: any, actual: any) => {
  expect(JSON.stringify(objSort(actual))).toEqual(
    JSON.stringify(objSort(expectedVal))
  )
}

it('mcFindById should work well', async () => {
  const [expectRes, clean] = await setupData()

  await repeatCall(10, async () => {
    const resp = await Test.mcFindById(expectRes._id)
    expectDocument(expectRes, resp)
  })

  await repeatCall(10, async () => {
    const resp = await Test.mcFindById(expectRes._id)
    expectDocument(expectRes, resp)
  })

  await clean()
})

it('mcFindByUniqueKey should work well', async () => {
  const [expectRes, clean] = await setupData()

  await repeatCall(10, async () => {
    const resp = await Test.mcFindByUniqueKey2(
      'studentCode',
      expectRes.studentCode
    )
    expectDocument(expectRes, resp)
  })

  await repeatCall(10, async () => {
    const resp = await Test.mcFindByUniqueKey2(
      'studentCode',
      expectRes.studentCode
    )
    expectDocument(expectRes, resp)
  })

  await clean()

  await expect(
    Test.mcFindByUniqueKey2('aaa' as any, expectRes.studentCode)
  ).rejects.toThrow()
})

it('mcUpdateOne should works well', async () => {
  const [expectRes, clean] = await setupData()
  const resp = await Test.mcFindByUniqueKey2(
    'studentCode',
    expectRes.studentCode
  )
  expectDocument(expectRes, resp)

  const resp2 = await Test.mcFindByUniqueKey2(
    'studentCode',
    expectRes.studentCode
  )
  expectDocument(expectRes, resp2)

  const resp3 = await Test.mcFindById(expectRes._id)
  expectDocument(expectRes, resp3)

  const resp4 = await Test.mcFindById(expectRes._id)
  expectDocument(expectRes, resp4)

  expectRes.desc = 'test222'
  await Test.mcUpdateOne(expectRes)

  const resp5 = await Test.mcFindByUniqueKey2(
    'studentCode',
    expectRes.studentCode
  )
  expectDocument(expectRes, resp5)

  const resp6 = await Test.mcFindByUniqueKey2(
    'studentCode',
    expectRes.studentCode
  )
  expectDocument(expectRes, resp6)

  const resp7 = await Test.mcFindById(expectRes._id)
  expectDocument(expectRes, resp7)

  const resp8 = await Test.mcFindById(expectRes._id)
  expectDocument(expectRes, resp8)

  await clean()
})

it('mcDeleteById should works well', async () => {
  const [expectRes, clean] = await setupData()
  const resp = await Test.mcFindByUniqueKey2(
    'studentCode',
    expectRes.studentCode
  )
  expectDocument(expectRes, resp)

  const resp2 = await Test.mcFindByUniqueKey2(
    'studentCode',
    expectRes.studentCode
  )
  expectDocument(expectRes, resp2)

  const resp3 = await Test.mcFindById(expectRes._id)
  expectDocument(expectRes, resp3)

  const resp4 = await Test.mcFindById(expectRes._id)
  expectDocument(expectRes, resp4)

  await Test.mcDeleteById(expectRes._id)

  const resp5 = await Test.mcFindByUniqueKey2(
    'studentCode',
    expectRes.studentCode
  )

  expectDocument(null, resp5)

  const resp6 = await Test.mcFindByUniqueKey2(
    'studentCode',
    expectRes.studentCode
  )
  expectDocument(null, resp6)

  const resp7 = await Test.mcFindById(expectRes._id)
  expectDocument(null, resp7)

  const resp8 = await Test.mcFindById(expectRes._id)
  expectDocument(null, resp8)

  await clean()

  await Test.mcDeleteById(expectRes._id)
})

it('mcDeleteDocCache should works well', async () => {
  const Test2Schema = new Schema<ITest>({
    studentCode: {
      type: String,
      unique: true,
    },
    name: String,
    age: Number,
    desc: String,
  })

  const redis = new Redis('redis://localhost:6379/2')

  setupCache(Test2Schema, new RedisCache({ redis, prefix: 'mongoose' }), {
    expire: 5,
    uniqueFields: ['studentCode'],
  })

  const Test2 = mongoose.model<ITest, CacheModel<ITest>>('Test2', Test2Schema)

  const doc = await Test2.create({
    studentCode: `a-${Date.now()}`,
    name: 'test1',
    age: 18,
    desc: 'haha',
  })

  const expectRes: any = doc.toJSON()

  let resp = await Test2.mcFindById(expectRes._id)
  expectDocument(expectRes, resp)
  resp = await Test2.mcFindById(expectRes._id)
  expectDocument(expectRes, resp)

  expect(await redis.dbsize()).toBe(1)

  await Test2.mcDeleteDocCache(doc)
  expect(await redis.dbsize()).toBe(0)

  resp = await Test2.mcFindByUniqueKey2('studentCode', expectRes.studentCode)
  expectDocument(expectRes, resp)

  resp = await Test2.mcFindByUniqueKey2('studentCode', expectRes.studentCode)
  expectDocument(expectRes, resp)

  expect(await redis.dbsize()).toBe(2)

  await Test2.mcDeleteDocCache(doc)
  expect(await redis.dbsize()).toBe(0)

  redis.disconnect()
})

it('disable option should works well', async () => {
  const Test1Schema = new Schema<ITest>({
    studentCode: {
      type: String,
      unique: true,
    },
    name: String,
    age: Number,
    desc: String,
  })

  const redis = new Redis('redis://localhost:6379/1')

  setupCache(Test1Schema, new RedisCache({ redis, prefix: 'mongoose' }), {
    expire: 5,
    uniqueFields: ['studentCode'],
    disable: true,
  })

  const Test1 = mongoose.model<ITest, CacheModel<ITest>>('Test1', Test1Schema)

  const doc = await Test1.create({
    studentCode: `a-${Date.now()}`,
    name: 'test1',
    age: 18,
    desc: 'haha',
  })

  const expectRes: any = doc.toJSON()

  let resp = await Test1.mcFindById(expectRes._id)
  expectDocument(expectRes, resp)
  resp = await Test1.mcFindById(expectRes._id)
  expectDocument(expectRes, resp)

  expect(await redis.dbsize()).toBe(0)

  resp = await Test1.mcFindByUniqueKey2('studentCode', expectRes.studentCode)
  expectDocument(expectRes, resp)

  resp = await Test1.mcFindByUniqueKey2('studentCode', expectRes.studentCode)
  expectDocument(expectRes, resp)

  expect(await redis.dbsize()).toBe(0)

  expectRes.desc = 'test222'
  await Test1.mcUpdateOne(expectRes)

  resp = await Test1.mcFindById(expectRes._id)
  expectDocument(expectRes, resp)

  resp = await Test1.mcFindByUniqueKey2('studentCode', expectRes.studentCode)
  expectDocument(expectRes, resp)

  expect(await redis.dbsize()).toBe(0)

  await Test1.mcDeleteDocCache(doc)

  expect(await redis.dbsize()).toBe(0)

  await Test1.mcDeleteById(expectRes._id)

  resp = await Test1.mcFindById(expectRes._id)
  expectDocument(null, resp)

  resp = await Test1.mcFindByUniqueKey2('studentCode', expectRes.studentCode)
  expectDocument(null, resp)

  expect(await redis.dbsize()).toBe(0)

  redis.disconnect()
})

it('aroundExpire should works well', () => {
  Array(10000)
    .fill(null)
    .forEach(() => {
      const e = aroundExpire(100, 0.05)
      expect(e >= 95 && e <= 105).toBeTruthy()
    })
})

it('fixOption should works well', () => {
  const o: Option<ITest> = {
    expire: 5,
    uniqueFields: ['studentCode'],
  }

  fixOption(o)
  expect(o.expiryDeviation).toBe(0.05)

  o.expiryDeviation = -1
  fixOption(o)
  expect(o.expiryDeviation).toBe(0)

  o.expiryDeviation = 2
  fixOption(o)
  expect(o.expiryDeviation).toBe(1)
})
