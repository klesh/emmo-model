CREATE TABLE `Users` (
  `id` int(10) AUTO_INCREMENT PRIMARY KEY,
  `nick` varchar(50),
  `roleId` int(10)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE UNIQUE INDEX `IDX_Users_nick` ON `Users` (`nick` ASC);
/***** PLACE YOUR CUSTOMIZE SCRIPT HERE *****/

/******** END YOUR CUSTOMIZE SCRIPT *********/
ALTER TABLE `Users` ADD CONSTRAINT `FK_Users_Roles` FOREIGN KEY (`roleId`) REFERENCES `Roles` (`id`);