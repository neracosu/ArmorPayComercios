-- CreateTable
CREATE TABLE `PlatformEvent` (
    `id` VARCHAR(191) NOT NULL,
    `actorUserId` VARCHAR(191) NULL,
    `actor` VARCHAR(191) NOT NULL,
    `targetOrgId` VARCHAR(191) NULL,
    `action` VARCHAR(191) NOT NULL,
    `detail` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `PlatformEvent_createdAt_idx`(`createdAt`),
    INDEX `PlatformEvent_targetOrgId_createdAt_idx`(`targetOrgId`, `createdAt`),
    INDEX `PlatformEvent_action_createdAt_idx`(`action`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

