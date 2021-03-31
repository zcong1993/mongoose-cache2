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

it('mcFindById should work well', async () => {
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
