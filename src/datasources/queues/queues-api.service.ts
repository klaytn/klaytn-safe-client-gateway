import { IConfigurationService } from '@/config/configuration.service.interface';
import { QueueConsumer } from '@/datasources/queues/queues-api.module';
import { IQueuesApiService } from '@/datasources/queues/queues-api.service.interface';
import { IQueueReadiness } from '@/domain/interfaces/queue-readiness.interface';
import { ILoggingService, LoggingService } from '@/logging/logging.interface';
import { Inject } from '@nestjs/common';
import { ConsumeMessage } from 'amqplib';

export class QueueApiService implements IQueuesApiService, IQueueReadiness {
  private readonly isEventsQueueEnabled: boolean;

  constructor(
    @Inject('QueueConsumer') private readonly consumer: QueueConsumer,
    @Inject(LoggingService) private readonly loggingService: ILoggingService,
    @Inject(IConfigurationService)
    private readonly configurationService: IConfigurationService,
  ) {
    this.isEventsQueueEnabled = this.configurationService.getOrThrow<boolean>(
      'features.eventsQueue',
    );
  }

  isReady(): boolean {
    if (this.isEventsQueueEnabled) {
      return this.consumer.connection.isConnected();
    }
    return true;
  }

  async subscribe(
    queueName: string,
    fn: (msg: ConsumeMessage) => Promise<void>,
  ): Promise<void> {
    if (!this.isEventsQueueEnabled) {
      return this.loggingService.warn(
        `Cannot subscribe to queue: ${queueName}. AMQP consumer is disabled`,
      );
    }
    await this.consumer.channel.consume(
      queueName,
      async (msg: ConsumeMessage) => {
        await fn(msg);
        // Note: each message is explicitly acknowledged at this point, only after a success callback execution.
        this.consumer.channel.ack(msg);
      },
    );
    this.loggingService.info(`Subscribed to queue: ${queueName}`);
  }
}
