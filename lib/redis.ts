import { Redis } from '@upstash/redis'

export const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!
})

export async function redisSetWithTTL(key:string, value:any, ttlSeconds:number = 7200) {
    await redis.set(key, value, {ex: ttlSeconds})    
}

export async function redisPublish(channel:string, message:any) {
    await redis.publish(channel, JSON.stringify(message))
}

export async function redisPush(key:string, value:any) {
    await redis.rpush(key, JSON.stringify(value))
}
