-- AlterTable
ALTER TABLE `Organization` ADD COLUMN `logo` MEDIUMBLOB NULL,
    ADD COLUMN `logoMime` VARCHAR(191) NULL,
    ADD COLUMN `logoUpdatedAt` DATETIME(3) NULL;
