import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { Passenger } from '../passenger/passenger.entity';
import { Flight } from '../flight/flight.entity';
import { Seat } from '../seat/seat.entity';
import { CheckInStatus } from '../common/types/enums';

@Entity('check_in')
@Unique('UQ_checkin_passenger_flight', ['passengerId', 'flightId'])
export class CheckIn {
  @PrimaryGeneratedColumn('uuid')
  readonly id!: string;

  @Column({ name: 'passenger_id', type: 'uuid' })
  readonly passengerId!: string;

  @ManyToOne(() => Passenger, (passenger) => passenger.checkIns)
  @JoinColumn({ name: 'passenger_id' })
  readonly passenger!: Passenger;

  @Column({ name: 'flight_id', type: 'uuid' })
  readonly flightId!: string;

  @ManyToOne(() => Flight, (flight) => flight.checkIns)
  @JoinColumn({ name: 'flight_id' })
  readonly flight!: Flight;

  @Column({ name: 'seat_id', type: 'uuid', nullable: true })
  seatId!: string | null;

  @ManyToOne(() => Seat, { nullable: true })
  @JoinColumn({ name: 'seat_id' })
  readonly seat!: Seat | null;

  @Column({
    type: 'enum',
    enum: CheckInStatus,
    default: CheckInStatus.IN_PROGRESS,
  })
  status!: CheckInStatus;

  @Column({
    name: 'baggage_weight',
    type: 'decimal',
    precision: 5,
    scale: 2,
    nullable: true,
  })
  baggageWeight!: string | null;

  @Column({
    name: 'excess_fee',
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
  })
  excessFee!: string | null;

  @Column({ name: 'payment_id', type: 'varchar', length: 100, nullable: true })
  paymentId!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  readonly createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  readonly updatedAt!: Date;
}
