import * as mongoose from 'mongoose'
import * as Redis from 'ioredis'
import { RedisCache } from '@zcong/node-redis-cache'
import { setupCache } from './cache'
const { Schema } = mongoose

mongoose.connect('mongodb://localhost/test', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  useCreateIndex: true,
})

const UserSchema = new Schema({
  studentCode: {
    type: String,
    unique: true,
  },
  name: String,
  age: Number,
  desc: String,
})

const redis = new Redis()

setupCache(UserSchema, new RedisCache({ redis, prefix: 'mongoose' }), {
  expire: 60,
  uniqueFields: ['studentCode'],
})

const User = mongoose.model('User', UserSchema)

const main = async () => {
  // await User.create({
  //   studentCode: 'xxx1',
  //   name: 'test1',
  //   age: 18,
  //   desc: 'haha'
  // })
  // const u: any = await User.findOne({studentCode: 'xxx1'})
  // u.desc = 'xxxxcd444'
  // // await u.save()
  // // await User.updateOne({studentCode: 'xxx1'}, { desc: 'hahah'})
  // console.log(await (User as any).cacheFindById(u._id))
  // await (User as any).cacheDeleteById(u._id)
  console.log(await (User as any).cacheFindByUniqueKey('xxx1', 'studentCode'))
  // await (User as any).cacheUpdateOne(u)
}

main()
