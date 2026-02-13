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
import { SeatStatus } from '../common/types/enums';

@Entity('seat')
@Unique('UQ_seat_flight_row_column', ['flightId', 'row', 'column'])
@Index('IDX_seat_flight_status', ['flightId', 'status'])
@Index('IDX_seat_held_by', ['heldBy'])
export class Seat {
  @PrimaryGeneratedColumn('uuid')
  readonly id!: string;

  @Column({ name: 'flight_id', type: 'uuid' })
  readonly flightId!: string;

  @ManyToOne(() => Flight, (flight) => flight.seats)
  @JoinColumn({ name: 'flight_id' })
  readonly flight!: Flight;

  @Column({ type: 'int' })
  readonly row!: number;

  @Column({ type: 'varchar', length: 1 })
  readonly column!: string;

  @Column({
    type: 'enum',
    enum: SeatStatus,
    default: SeatStatus.AVAILABLE,
  })
  status!: SeatStatus;

  @Column({ name: 'held_by', type: 'uuid', nullable: true })
  heldBy!: string | null;

  @ManyToOne(() => Passenger, (passenger) => passenger.heldSeats, {
    nullable: true,
  })
  @JoinColumn({ name: 'held_by' })
  readonly heldByPassenger!: Passenger | null;

  @Column({ name: 'held_at', type: 'timestamptz', nullable: true })
  heldAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  readonly createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  readonly updatedAt!: Date;
}
