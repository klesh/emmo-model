ALTER TABLE "Roles" RENAME TO "Groups";
ALTER TABLE "Groups" RENAME CONSTRAINT "PK_Roles" TO "PK_Groups";
DROP INDEX "IDX_Roles_name";
DROP TABLE "Smokes";
/***** PLACE YOUR CUSTOMIZE SCRIPT HERE *****/

/******** END YOUR CUSTOMIZE SCRIPT *********/
CREATE INDEX "IDX_Groups_name" ON "Groups" ("name" ASC);