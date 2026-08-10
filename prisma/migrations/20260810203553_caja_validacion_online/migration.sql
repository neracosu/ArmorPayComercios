-- AlterTable
ALTER TABLE `PaymentClaim` ADD COLUMN `validationRequestId` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `ValidationRequest` (
    `id` VARCHAR(191) NOT NULL,
    `organizationId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `type` ENUM('VAL_P2P', 'VAL_P2P_CC', 'VAL_TRANSFER', 'VAL_TRANSACTION', 'BT_C2P') NOT NULL,
    `accountId` VARCHAR(191) NULL,
    `merchantCode` VARCHAR(191) NULL,
    `date` VARCHAR(191) NOT NULL,
    `amount` VARCHAR(191) NOT NULL,
    `reference` VARCHAR(191) NOT NULL,
    `bankCode` VARCHAR(191) NULL,
    `phone` VARCHAR(191) NULL,
    `dni` VARCHAR(191) NULL,
    `trace` VARCHAR(191) NOT NULL,
    `responseCode` VARCHAR(191) NOT NULL,
    `responseMsg` VARCHAR(191) NOT NULL,
    `rawResponse` TEXT NOT NULL,
    `durationMs` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ValidationRequest_organizationId_createdAt_idx`(`organizationId`, `createdAt`),
    INDEX `ValidationRequest_userId_createdAt_idx`(`userId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `PaymentClaim_validationRequestId_key` ON `PaymentClaim`(`validationRequestId`);

-- AddForeignKey
ALTER TABLE `PaymentClaim` ADD CONSTRAINT `PaymentClaim_validationRequestId_fkey` FOREIGN KEY (`validationRequestId`) REFERENCES `ValidationRequest`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ValidationRequest` ADD CONSTRAINT `ValidationRequest_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ValidationRequest` ADD CONSTRAINT `ValidationRequest_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ValidationRequest` ADD CONSTRAINT `ValidationRequest_accountId_fkey` FOREIGN KEY (`accountId`) REFERENCES `BankAccount`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

