import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

/*
  Prisma 7 ходит в базу только через адаптер, строка подключения больше не живёт в схеме.

  Единственный экземпляр на процесс: в режиме разработки Next перезагружает модули на каждую
  правку, и без глобальной ссылки соединения копятся до отказа базы.
*/

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("Не задана переменная DATABASE_URL");
}

function sozdat() {
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
    log:
      process.env.NODE_ENV === "development"
        ? ["warn", "error"]
        : ["error"],
  });
}

const globalForPrisma = globalThis as unknown as {
  prisma?: ReturnType<typeof sozdat>;
};

export const db = globalForPrisma.prisma ?? sozdat();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}
