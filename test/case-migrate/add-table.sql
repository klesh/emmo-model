CREATE TABLE "Users" (
  "id" serial,
  "nick" varchar(50),
  "roleId" int
);
ALTER TABLE "Users" ADD CONSTRAINT "PK_Users" PRIMARY KEY ("id");
CREATE INDEX "IDX_Users_nick" ON "Users" ("nick" ASC);