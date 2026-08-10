-- AlterTable
ALTER TABLE `Organization` ADD COLUMN `terminosAceptadosAt` DATETIME(3) NULL,
    ADD COLUMN `terminosVersion` VARCHAR(191) NULL;

