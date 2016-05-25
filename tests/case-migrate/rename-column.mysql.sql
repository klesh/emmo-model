ALTER TABLE `Roles` CHANGE COLUMN `name` `title` varchar(50);
ALTER TABLE `Roles` RENAME INDEX `IDX_Roles_name` TO `IDX_Roles_title`;
/***** PLACE YOUR CUSTOMIZE SCRIPT HERE *****/

/******** END YOUR CUSTOMIZE SCRIPT *********/
