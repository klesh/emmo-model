CREATE TABLE "Users" (
  "id" serial,
  "nick" varchar(50),
  "roleId" int
);
ALTER TABLE "Users" ADD CONSTRAINT "PK_Users" PRIMARY KEY ("id");
CREATE UNIQUE INDEX "IDX_Users_nick" ON "Users" ("nick" ASC);
/***** PLACE YOUR CUSTOMIZE SCRIPT HERE *****/

/******** END YOUR CUSTOMIZE SCRIPT *********/
ALTER TABLE "Users" ADD CONSTRAINT "FK_Users_Roles" FOREIGN KEY ("roleId") REFERENCES "Roles" ("id");