CREATE TABLE `Departments` (
  `id` int(10) AUTO_INCREMENT PRIMARY KEY,
  `title` varchar(50) NOT NULL,
  `remark` text
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE `Roles` (
  `name` varchar(50) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8;
ALTER TABLE `Roles` ADD PRIMARY KEY (`name`);
CREATE TABLE `Users` (
  `id` int(10) AUTO_INCREMENT PRIMARY KEY,
  `name` varchar(50) NOT NULL,
  `password` varchar(40),
  `departmentId` int(10)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE UNIQUE INDEX `IX_Users_nick` ON `Users` (`name` ASC);
ALTER TABLE `Users` ADD CONSTRAINT `FK_Users_Departments` FOREIGN KEY (`departmentId`) REFERENCES `Departments` (`id`) ON DELETE SET NULL;