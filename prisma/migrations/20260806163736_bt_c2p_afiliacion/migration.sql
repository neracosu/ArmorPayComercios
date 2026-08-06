-- AlterTable
ALTER TABLE `Organization` ADD COLUMN `btC2pEnabled` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `btCodAfiliado` VARCHAR(191) NULL;
