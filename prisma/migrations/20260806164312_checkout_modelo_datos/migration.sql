/*
  Warnings:

  - A unique constraint covering the columns `[checkoutIntentId]` on the table `PaymentClaim` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE `PaymentClaim` ADD COLUMN `checkoutIntentId` VARCHAR(191) NULL,
    MODIFY `shiftId` VARCHAR(191) NULL,
    MODIFY `userId` VARCHAR(191) NULL,
    MODIFY `branchId` VARCHAR(191) NULL,
    MODIFY `source` ENUM('LOOKUP', 'ONLINE', 'CHECKOUT') NOT NULL DEFAULT 'LOOKUP';

-- CreateTable
CREATE TABLE `ApiKey` (
    `id` VARCHAR(191) NOT NULL,
    `organizationId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `prefix` VARCHAR(191) NOT NULL,
    `hashedKey` VARCHAR(191) NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `lastUsedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `ApiKey_prefix_key`(`prefix`),
    INDEX `ApiKey_organizationId_idx`(`organizationId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CheckoutIntent` (
    `id` VARCHAR(191) NOT NULL,
    `organizationId` VARCHAR(191) NOT NULL,
    `apiKeyId` VARCHAR(191) NOT NULL,
    `externalRef` VARCHAR(191) NOT NULL,
    `amountVES` DECIMAL(18, 2) NOT NULL,
    `concepto` VARCHAR(191) NOT NULL,
    `method` ENUM('REFERENCIA', 'C2P') NULL,
    `status` ENUM('PENDING', 'CONFIRMED', 'FAILED', 'EXPIRED') NOT NULL DEFAULT 'PENDING',
    `idempotencyKey` VARCHAR(191) NOT NULL,
    `bankTransactionId` VARCHAR(191) NULL,
    `c2pReferencia` VARCHAR(191) NULL,
    `c2pCodres` VARCHAR(191) NULL,
    `gatewayResponse` TEXT NULL,
    `overpaidVES` DECIMAL(18, 2) NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `confirmedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `CheckoutIntent_organizationId_status_createdAt_idx`(`organizationId`, `status`, `createdAt`),
    INDEX `CheckoutIntent_status_expiresAt_idx`(`status`, `expiresAt`),
    UNIQUE INDEX `CheckoutIntent_organizationId_idempotencyKey_key`(`organizationId`, `idempotencyKey`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `WebhookEndpoint` (
    `id` VARCHAR(191) NOT NULL,
    `organizationId` VARCHAR(191) NOT NULL,
    `url` VARCHAR(191) NOT NULL,
    `secretEnc` TEXT NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `WebhookEndpoint_organizationId_idx`(`organizationId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `WebhookDelivery` (
    `id` VARCHAR(191) NOT NULL,
    `organizationId` VARCHAR(191) NOT NULL,
    `endpointId` VARCHAR(191) NOT NULL,
    `intentId` VARCHAR(191) NOT NULL,
    `payload` TEXT NOT NULL,
    `status` ENUM('PENDING', 'DELIVERED', 'FAILED_RETRYING', 'DEAD') NOT NULL DEFAULT 'PENDING',
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `nextRetryAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `lastError` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `WebhookDelivery_status_nextRetryAt_idx`(`status`, `nextRetryAt`),
    INDEX `WebhookDelivery_organizationId_createdAt_idx`(`organizationId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ApiEvent` (
    `id` VARCHAR(191) NOT NULL,
    `organizationId` VARCHAR(191) NOT NULL,
    `apiKeyId` VARCHAR(191) NULL,
    `intentId` VARCHAR(191) NULL,
    `action` VARCHAR(191) NOT NULL,
    `detail` TEXT NULL,
    `clientIp` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ApiEvent_organizationId_createdAt_idx`(`organizationId`, `createdAt`),
    INDEX `ApiEvent_clientIp_createdAt_idx`(`clientIp`, `createdAt`),
    INDEX `ApiEvent_apiKeyId_createdAt_idx`(`apiKeyId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `PaymentClaim_checkoutIntentId_key` ON `PaymentClaim`(`checkoutIntentId`);

-- AddForeignKey
ALTER TABLE `PaymentClaim` ADD CONSTRAINT `PaymentClaim_checkoutIntentId_fkey` FOREIGN KEY (`checkoutIntentId`) REFERENCES `CheckoutIntent`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ApiKey` ADD CONSTRAINT `ApiKey_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CheckoutIntent` ADD CONSTRAINT `CheckoutIntent_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CheckoutIntent` ADD CONSTRAINT `CheckoutIntent_bankTransactionId_fkey` FOREIGN KEY (`bankTransactionId`) REFERENCES `BankTransaction`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WebhookEndpoint` ADD CONSTRAINT `WebhookEndpoint_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
