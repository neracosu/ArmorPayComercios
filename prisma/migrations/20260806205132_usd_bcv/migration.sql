-- AlterTable
ALTER TABLE `CheckoutIntent` ADD COLUMN `amountUSD` DECIMAL(18, 2) NULL,
    ADD COLUMN `exchangeRateId` VARCHAR(191) NULL,
    ADD COLUMN `exchangeRateUsed` DECIMAL(18, 4) NULL;

-- CreateTable
CREATE TABLE `ExchangeRate` (
    `id` VARCHAR(191) NOT NULL,
    `rate` DECIMAL(18, 4) NOT NULL,
    `source` VARCHAR(191) NOT NULL,
    `fetchedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ExchangeRate_fetchedAt_idx`(`fetchedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
