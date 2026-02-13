import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Seat } from '../seat/seat.entity';
import { CheckIn } from '../check-in/check-in.entity';
import { Waitlist } from '../waitlist/waitlist.entity';

@Entity('passenger')
export class Passenger {
  @PrimaryGeneratedColumn('uuid')
  readonly id!: string;

  @Column({ name: 'first_name', type: 'varchar', length: 100 })
  readonly firstName!: string;

  @Column({ name: 'last_name', type: 'varchar', length: 100 })
  readonly lastName!: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  readonly email!: string;

  @OneToMany(() => Seat, (seat) => seat.heldByPassenger)
  readonly heldSeats!: Seat[];

  @OneToMany(() => CheckIn, (checkIn) => checkIn.passenger)
  readonly checkIns!: CheckIn[];

  @OneToMany(() => Waitlist, (waitlist) => waitlist.passenger)
  readonly waitlistEntries!: Waitlist[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  readonly createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  readonly updatedAt!: Date;
}
