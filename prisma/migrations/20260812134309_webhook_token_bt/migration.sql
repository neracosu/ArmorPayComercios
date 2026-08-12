-- AlterTable
ALTER TABLE `BankAccount` ADD COLUMN `webhookToken` VARCHAR(191) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `BankAccount_webhookToken_key` ON `BankAccount`(`webhookToken`);

