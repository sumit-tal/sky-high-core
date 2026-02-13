import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Flight } from '../flight/flight.entity';

@Entity('aircraft_type')
export class AircraftType {
  @PrimaryGeneratedColumn('uuid')
  readonly id!: string;

  @Column({ type: 'varchar', length: 50 })
  readonly name!: string;

  @Column({ type: 'int' })
  readonly rows!: number;

  @Column({ type: 'varchar', length: 20 })
  readonly columns!: string;

  @OneToMany(() => Flight, (flight) => flight.aircraftType)
  readonly flights!: Flight[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  readonly createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  readonly updatedAt!: Date;
}
