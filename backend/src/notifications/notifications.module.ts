import { Global, Module } from '@nestjs/common';
import { MailService } from './mail.service.js';
import { NotificationsService } from './notifications.service.js';

/** Global để mọi module (auth, tickets...) inject MailService/NotificationsService mà không cần import. */
@Global()
@Module({
  providers: [MailService, NotificationsService],
  exports: [MailService, NotificationsService],
})
export class NotificationsModule {}
