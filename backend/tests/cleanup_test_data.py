"""Cleanup TEST_-prefixed exams/attempts/users created by the QA suite."""
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import dotenv_values

env = dotenv_values("/app/backend/.env")


async def main():
    c = AsyncIOMotorClient(env["MONGO_URL"])
    db = c[env["DB_NAME"]]
    codes = [e["code"] async for e in db.exams.find({"name": {"$regex": "^TEST_"}}, {"code": 1})]
    a = await db.attempts.delete_many({"examCode": {"$in": codes}})
    a2 = await db.attempts.delete_many({"studentName": {"$regex": "^TEST_"}})
    e = await db.exams.delete_many({"name": {"$regex": "^TEST_"}})
    u = await db.users.delete_many({"email": {"$regex": "^test_(lock|esc)_"}})
    la = await db.login_attempts.delete_many({"_id": {"$regex": "test_lock_"}})
    print(f"deleted {e.deleted_count} exams, {a.deleted_count + a2.deleted_count} attempts, "
          f"{u.deleted_count} test users, {la.deleted_count} lockout records")

asyncio.run(main())
