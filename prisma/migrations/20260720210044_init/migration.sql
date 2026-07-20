-- CreateTable
CREATE TABLE `Organization` (
    `id` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `razonSocial` VARCHAR(191) NOT NULL,
    `rif` VARCHAR(191) NOT NULL,
    `status` ENUM('REGISTRADA', 'RECAUDOS_COMPLETOS', 'ENVIADA_AL_BANCO', 'CERTIFICACION', 'ACTIVA', 'RECHAZADA', 'SUSPENDIDA') NOT NULL DEFAULT 'REGISTRADA',
    `authKeyEnc` TEXT NULL,
    `authKeyHint` VARCHAR(191) NULL,
    `authKeyStatus` ENUM('SIN_LLAVE', 'CARGADA', 'VERIFICADA', 'INVALIDA') NOT NULL DEFAULT 'SIN_LLAVE',
    `authKeyVersion` INTEGER NOT NULL DEFAULT 1,
    `lastVerifiedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Organization_slug_key`(`slug`),
    UNIQUE INDEX `Organization_rif_key`(`rif`),
    INDEX `Organization_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AuthKeyEvent` (
    `id` VARCHAR(191) NOT NULL,
    `organizationId` VARCHAR(191) NOT NULL,
    `action` VARCHAR(191) NOT NULL,
    `actorUserId` VARCHAR(191) NULL,
    `detail` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `AuthKeyEvent_organizationId_createdAt_idx`(`organizationId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `User` (
    `id` VARCHAR(191) NOT NULL,
    `organizationId` VARCHAR(191) NULL,
    `username` VARCHAR(191) NOT NULL,
    `passwordHash` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `role` ENUM('PLATFORM_ADMIN', 'ORG_ADMIN', 'OPERATOR') NOT NULL DEFAULT 'OPERATOR',
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `tokenVersion` INTEGER NOT NULL DEFAULT 0,
    `branchId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `User_username_key`(`username`),
    INDEX `User_organizationId_idx`(`organizationId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Branch` (
    `id` VARCHAR(191) NOT NULL,
    `organizationId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Branch_organizationId_code_key`(`organizationId`, `code`),
    UNIQUE INDEX `Branch_organizationId_name_key`(`organizationId`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BankAccount` (
    `id` VARCHAR(191) NOT NULL,
    `organizationId` VARCHAR(191) NOT NULL,
    `accountNumber` VARCHAR(191) NOT NULL,
    `alias` VARCHAR(191) NOT NULL,
    `merchantCode` VARCHAR(191) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `BankAccount_accountNumber_key`(`accountNumber`),
    UNIQUE INDEX `BankAccount_merchantCode_key`(`merchantCode`),
    INDEX `BankAccount_organizationId_idx`(`organizationId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BankTransaction` (
    `id` VARCHAR(191) NOT NULL,
    `organizationId` VARCHAR(191) NOT NULL,
    `numeroCuenta` VARCHAR(191) NOT NULL,
    `montoTransaccion` VARCHAR(191) NOT NULL,
    `fechaTransaccion` VARCHAR(191) NOT NULL,
    `horaTransaccion` VARCHAR(191) NOT NULL,
    `referencia` VARCHAR(191) NOT NULL,
    `tipo` VARCHAR(191) NOT NULL,
    `descripcion` TEXT NOT NULL,
    `desdeBanco` VARCHAR(191) NOT NULL,
    `tipoProd` VARCHAR(191) NOT NULL,
    `desdeCuenta` VARCHAR(191) NOT NULL,
    `desdeDni` VARCHAR(191) NOT NULL,
    `origen` VARCHAR(191) NOT NULL,
    `receivedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `rawPayload` MEDIUMTEXT NOT NULL,

    INDEX `BankTransaction_organizationId_receivedAt_idx`(`organizationId`, `receivedAt`),
    INDEX `BankTransaction_organizationId_referencia_idx`(`organizationId`, `referencia`),
    UNIQUE INDEX `BankTransaction_numeroCuenta_referencia_fechaTransaccion_hor_key`(`numeroCuenta`, `referencia`, `fechaTransaccion`, `horaTransaccion`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Shift` (
    `id` VARCHAR(191) NOT NULL,
    `organizationId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `branchId` VARCHAR(191) NOT NULL,
    `status` ENUM('OPEN', 'CLOSED') NOT NULL DEFAULT 'OPEN',
    `attendant` VARCHAR(191) NULL,
    `openedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `closedAt` DATETIME(3) NULL,
    `closingNote` TEXT NULL,
    `totalCount` INTEGER NULL,
    `totalAmount` DECIMAL(18, 2) NULL,
    `openKey` VARCHAR(191) NULL,

    UNIQUE INDEX `Shift_openKey_key`(`openKey`),
    INDEX `Shift_organizationId_openedAt_idx`(`organizationId`, `openedAt`),
    INDEX `Shift_userId_openedAt_idx`(`userId`, `openedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PaymentClaim` (
    `id` VARCHAR(191) NOT NULL,
    `organizationId` VARCHAR(191) NOT NULL,
    `shiftId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `branchId` VARCHAR(191) NOT NULL,
    `source` ENUM('LOOKUP', 'ONLINE') NOT NULL DEFAULT 'LOOKUP',
    `bankTransactionId` VARCHAR(191) NULL,
    `reference` VARCHAR(191) NOT NULL,
    `amount` DECIMAL(18, 2) NOT NULL,
    `numeroCuenta` VARCHAR(191) NOT NULL,
    `payerBank` VARCHAR(191) NULL,
    `fechaTransaccion` VARCHAR(191) NULL,
    `horaTransaccion` VARCHAR(191) NULL,
    `isDuplicate` BOOLEAN NOT NULL DEFAULT false,
    `duplicateOfId` VARCHAR(191) NULL,
    `ackReason` TEXT NULL,
    `claimedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `primaryKey` VARCHAR(191) NULL,

    UNIQUE INDEX `PaymentClaim_primaryKey_key`(`primaryKey`),
    INDEX `PaymentClaim_organizationId_claimedAt_idx`(`organizationId`, `claimedAt`),
    INDEX `PaymentClaim_shiftId_idx`(`shiftId`),
    INDEX `PaymentClaim_bankTransactionId_idx`(`bankTransactionId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PlatformSetting` (
    `key` VARCHAR(191) NOT NULL,
    `value` TEXT NOT NULL,
    `isSecret` BOOLEAN NOT NULL DEFAULT false,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `AuthKeyEvent` ADD CONSTRAINT `AuthKeyEvent_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `User` ADD CONSTRAINT `User_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `User` ADD CONSTRAINT `User_branchId_fkey` FOREIGN KEY (`branchId`) REFERENCES `Branch`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Branch` ADD CONSTRAINT `Branch_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BankAccount` ADD CONSTRAINT `BankAccount_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BankTransaction` ADD CONSTRAINT `BankTransaction_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Shift` ADD CONSTRAINT `Shift_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Shift` ADD CONSTRAINT `Shift_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Shift` ADD CONSTRAINT `Shift_branchId_fkey` FOREIGN KEY (`branchId`) REFERENCES `Branch`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PaymentClaim` ADD CONSTRAINT `PaymentClaim_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PaymentClaim` ADD CONSTRAINT `PaymentClaim_shiftId_fkey` FOREIGN KEY (`shiftId`) REFERENCES `Shift`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PaymentClaim` ADD CONSTRAINT `PaymentClaim_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PaymentClaim` ADD CONSTRAINT `PaymentClaim_branchId_fkey` FOREIGN KEY (`branchId`) REFERENCES `Branch`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PaymentClaim` ADD CONSTRAINT `PaymentClaim_bankTransactionId_fkey` FOREIGN KEY (`bankTransactionId`) REFERENCES `BankTransaction`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PaymentClaim` ADD CONSTRAINT `PaymentClaim_duplicateOfId_fkey` FOREIGN KEY (`duplicateOfId`) REFERENCES `PaymentClaim`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
