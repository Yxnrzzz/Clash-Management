import { Body, Controller, Get, Patch } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../auth/auth.types';
import { NotificationPreferenceService } from './notification-preference.service';
import { UpdateNotificationPreferenceDto } from './dto/notification-preference.dto';

/** No @Roles() — every signed-in user manages only their own preference, scoped via CurrentUser. */
@Controller('notification-preferences')
export class NotificationPreferenceController {
  constructor(private readonly service: NotificationPreferenceService) {}

  @Get('me')
  getMine(@CurrentUser() user: AuthUser) {
    return this.service.getForUser(user.id);
  }

  @Patch('me')
  updateMine(@CurrentUser() user: AuthUser, @Body() dto: UpdateNotificationPreferenceDto) {
    return this.service.update(user.id, dto);
  }
}
