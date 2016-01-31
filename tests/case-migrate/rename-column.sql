ALTER TABLE "Roles" RENAME COLUMN "name" TO "title";
ALTER INDEX "IDX_Roles_name" RENAME To "IDX_Roles_title";
/***** PLACE YOUR CUSTOMIZE SCRIPT HERE *****/

/******** END YOUR CUSTOMIZE SCRIPT *********/
