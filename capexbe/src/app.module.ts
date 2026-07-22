import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { CacheAsideService } from './shared/cache-aside.service';
import { ProjectListModule } from './project-list/project-list.module';
import { SmartMigrationModule } from './smart-migration/smart-migration.module';
import { BootstrapModule } from './bootstrap/bootstrap.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { BudgetHuModule } from './budget-hu/budget-hu.module';
import { MyTasksModule } from './my-tasks/my-tasks.module';
import { TaskActionsModule } from './task-actions/task-actions.module';
import { UserAdminModule } from './user-admin/user-admin.module';
import { ConfigurationModule } from './configuration/configuration.module';
import { AssetTimelineModule } from './asset-timeline/asset-timeline.module';
import { FsModule } from './fs/fs.module';
import { FsUpdateModule } from './fs-update/fs-update.module';
import { FsApprovalModule } from './fs-approval/fs-approval.module';
import { FsRealizationModule } from './fs-realization/fs-realization.module';
import { ExecutiveSummaryModule } from './executive-summary/executive-summary.module';
import { MonitoringModule } from './monitoring/monitoring.module';
import { DuplicateDetectionModule } from './duplicate-detection/duplicate-detection.module';
import { PoUpdateModule } from './po-update/po-update.module';
import { GrUpdateModule } from './gr-update/gr-update.module';
import { MomDailySummaryModule } from './mom-daily-summary/mom-daily-summary.module';
import { BudgetMultiYearModule } from './budget-multi-year/budget-multi-year.module';
import { NotificationsModule } from './notifications/notifications.module';
import { AuditModule } from './audit/audit.module';

@Module({
  imports: [
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 60_000, limit: 120 }],
    }),
    AuthModule,
    ProjectListModule,
    DuplicateDetectionModule,
    AssetTimelineModule,
    SmartMigrationModule,
    BootstrapModule,
    DashboardModule,
    BudgetHuModule,
    MyTasksModule,
    TaskActionsModule,
    UserAdminModule,
    ConfigurationModule,
    FsModule,
    FsUpdateModule,
    FsApprovalModule,
    FsRealizationModule,
    ExecutiveSummaryModule,
    MonitoringModule,
    PoUpdateModule,
    GrUpdateModule,
    MomDailySummaryModule,
    BudgetMultiYearModule,
    NotificationsModule,
    AuditModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    CacheAsideService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
})
export class AppModule {}
