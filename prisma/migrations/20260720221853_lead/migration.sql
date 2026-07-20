-- CreateTable
CREATE TABLE `Lead` (
    `id` VARCHAR(191) NOT NULL,
    `empresa` VARCHAR(191) NOT NULL,
    `rif` VARCHAR(191) NULL,
    `contacto` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `telefono` VARCHAR(191) NULL,
    `cajas` INTEGER NULL,
    `sucursales` INTEGER NULL,
    `banco` VARCHAR(191) NULL,
    `mensaje` TEXT NULL,
    `estado` ENUM('NUEVO', 'CONTACTADO', 'CONVERTIDO', 'DESCARTADO') NOT NULL DEFAULT 'NUEVO',
    `notaInterna` TEXT NULL,
    `organizationId` VARCHAR(191) NULL,
    `convertidoPor` VARCHAR(191) NULL,
    `convertidoAt` DATETIME(3) NULL,
    `clientIp` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Lead_estado_createdAt_idx`(`estado`, `createdAt`),
    INDEX `Lead_clientIp_createdAt_idx`(`clientIp`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
