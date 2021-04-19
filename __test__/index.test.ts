import * as mongoose from 'mongoose'
import * as Redis from 'ioredis'
import { RedisCache } from '@zcong/node-redis-cache'
import { setupCache } from '../src'

const { Schema } = mongoose

const repeatCall = (n: number, fn: Function) =>
  Promise.all(
    Array(n)
      .fill(null)
      .map((_) => fn())
  )

mongoose.connect('mongodb://localhost/test', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  useCreateIndex: true,
})

const TestSchema = new Schema({
  studentCode: {
    type: String,
    unique: true,
  },
  name: String,
  age: Number,
  desc: String,
})

const redis = new Redis()

setupCache(TestSchema, new RedisCache({ redis, prefix: 'mongoose' }), {
  expire: 5,
  uniqueFields: ['studentCode'],
})

const Test = mongoose.model('Test', TestSchema)

const setupData = async (): Promise<[any, any]> => {
  const doc = await Test.create({
    studentCode: `a-${Date.now()}`,
    name: 'test1',
    age: 18,
    desc: 'haha',
  })

  return [doc.toJSON(), () => Test.deleteOne({ _id: doc._id })]
}

const expectDocument = (expectedVal: any, actual: any) => {
  expect(JSON.stringify(actual)).toEqual(JSON.stringify(expectedVal))
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
    const resp = await Test.mcFindByUniqueKey(
      expectRes.studentCode,
      'studentCode'
    )
    expectDocument(expectRes, resp)
  })

  await repeatCall(10, async () => {
    const resp = await Test.mcFindByUniqueKey(
      expectRes.studentCode,
      'studentCode'
    )
    expectDocument(expectRes, resp)
  })

  await clean()
})

it('mcUpdateOne should works well', async () => {
  const [expectRes, clean] = await setupData()
  const resp = await Test.mcFindByUniqueKey(
    expectRes.studentCode,
    'studentCode'
  )
  expectDocument(expectRes, resp)

  const resp2 = await Test.mcFindByUniqueKey(
    expectRes.studentCode,
    'studentCode'
  )
  expectDocument(expectRes, resp2)

  const resp3 = await Test.mcFindById(expectRes._id)
  expectDocument(expectRes, resp3)

  const resp4 = await Test.mcFindById(expectRes._id)
  expectDocument(expectRes, resp4)

  expectRes.desc = 'test222'
  await Test.mcUpdateOne(expectRes)

  const resp5 = await Test.mcFindByUniqueKey(
    expectRes.studentCode,
    'studentCode'
  )
  expectDocument(expectRes, resp5)

  const resp6 = await Test.mcFindByUniqueKey(
    expectRes.studentCode,
    'studentCode'
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
  const resp = await Test.mcFindByUniqueKey(
    expectRes.studentCode,
    'studentCode'
  )
  expectDocument(expectRes, resp)

  const resp2 = await Test.mcFindByUniqueKey(
    expectRes.studentCode,
    'studentCode'
  )
  expectDocument(expectRes, resp2)

  const resp3 = await Test.mcFindById(expectRes._id)
  expectDocument(expectRes, resp3)

  const resp4 = await Test.mcFindById(expectRes._id)
  expectDocument(expectRes, resp4)

  await Test.mcDeleteById(expectRes._id)

  const resp5 = await Test.mcFindByUniqueKey(
    expectRes.studentCode,
    'studentCode'
  )

  expectDocument(null, resp5)

  const resp6 = await Test.mcFindByUniqueKey(
    expectRes.studentCode,
    'studentCode'
  )
  expectDocument(null, resp6)

  const resp7 = await Test.mcFindById(expectRes._id)
  expectDocument(null, resp7)

  const resp8 = await Test.mcFindById(expectRes._id)
  expectDocument(null, resp8)

  await clean()
})

it('disable option should works well', async () => {
  const Test1Schema = new Schema({
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

  const Test1 = mongoose.model('Test1', Test1Schema)

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

  resp = await Test1.mcFindByUniqueKey(expectRes.studentCode, 'studentCode')
  expectDocument(expectRes, resp)

  resp = await Test1.mcFindByUniqueKey(expectRes.studentCode, 'studentCode')
  expectDocument(expectRes, resp)

  expect(await redis.dbsize()).toBe(0)

  expectRes.desc = 'test222'
  await Test1.mcUpdateOne(expectRes)

  resp = await Test1.mcFindById(expectRes._id)
  expectDocument(expectRes, resp)

  resp = await Test1.mcFindByUniqueKey(expectRes.studentCode, 'studentCode')
  expectDocument(expectRes, resp)

  expect(await redis.dbsize()).toBe(0)

  await Test1.mcDeleteById(expectRes._id)

  resp = await Test1.mcFindById(expectRes._id)
  expectDocument(null, resp)

  resp = await Test1.mcFindByUniqueKey(expectRes.studentCode, 'studentCode')
  expectDocument(null, resp)

  expect(await redis.dbsize()).toBe(0)
})
