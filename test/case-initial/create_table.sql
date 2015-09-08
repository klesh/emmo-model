CREATE TABLE "Departments" (
  "id" serial,
  "title" varchar(50) NOT NULL,
  "remark" text
);
ALTER TABLE "Departments" ADD CONSTRAINT "PK_Departments" PRIMARY KEY ("id");
CREATE TABLE "Users" (
  "id" serial,
  "nick" varchar(50) NOT NULL,
  "password" varchar(40),
  "departmentId" int
);
ALTER TABLE "Users" ADD CONSTRAINT "PK_Users" PRIMARY KEY ("id");
CREATE UNIQUE INDEX "IX_Users_nick" ON "Users" ("nick" ASC);
ALTER TABLE "Users" ADD CONSTRAINT "FK_Users_Departments" FOREIGN KEY ("departmentId") REFERENCES "Departments" ("id") ON DELETE SET NULL;