-- AlterTable
ALTER TABLE `BankAccount` ADD COLUMN `banco` VARCHAR(191) NOT NULL DEFAULT 'BDT';

-- AlterTable
ALTER TABLE `BankTransaction` ADD COLUMN `banco` VARCHAR(191) NOT NULL DEFAULT 'BDT';

-- CreateIndex
CREATE INDEX `BankTransaction_organizationId_banco_idx` ON `BankTransaction`(`organizationId`, `banco`);
