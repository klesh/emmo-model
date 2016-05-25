ALTER TABLE `Roles` RENAME `Groups`;
ALTER TABLE `Groups` DROP INDEX `IDX_Roles_name`;
DROP TABLE `Smokes`;
/***** PLACE YOUR CUSTOMIZE SCRIPT HERE *****/

/******** END YOUR CUSTOMIZE SCRIPT *********/
CREATE INDEX `IDX_Groups_name` ON `Groups` (`name` ASC);