import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { Flight } from '../flight/flight.entity';
import { Passenger } from '../passenger/passenger.entity';
import { WaitlistStatus } from '../common/types/enums';

@Entity('waitlist')
@Unique('UQ_waitlist_flight_passenger', ['flightId', 'passengerId'])
@Index('IDX_waitlist_flight_status_position', ['flightId', 'status', 'position'])
export class Waitlist {
  @PrimaryGeneratedColumn('uuid')
  readonly id!: string;

  @Column({ name: 'flight_id', type: 'uuid' })
  readonly flightId!: string;

  @ManyToOne(() => Flight, (flight) => flight.waitlistEntries)
  @JoinColumn({ name: 'flight_id' })
  readonly flight!: Flight;

  @Column({ name: 'passenger_id', type: 'uuid' })
  readonly passengerId!: string;

  @ManyToOne(() => Passenger, (passenger) => passenger.waitlistEntries)
  @JoinColumn({ name: 'passenger_id' })
  readonly passenger!: Passenger;

  @Column({ type: 'int' })
  position!: number;

  @Column({
    type: 'enum',
    enum: WaitlistStatus,
    default: WaitlistStatus.WAITING,
  })
  status!: WaitlistStatus;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  readonly createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  readonly updatedAt!: Date;
}
