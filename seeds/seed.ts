import { DataSource } from 'typeorm';
import { dataSourceOptions } from '../src/common/database/data-source';
import { AircraftType } from '../src/aircraft-type/aircraft-type.entity';
import { Flight } from '../src/flight/flight.entity';
import { Passenger } from '../src/passenger/passenger.entity';
import { Seat } from '../src/seat/seat.entity';
import { FlightStatus } from '../src/common/types/enums';
import { SeatStatus } from '../src/common/types/enums';

interface AircraftTypeSeed {
  readonly name: string;
  readonly rows: number;
  readonly columns: string;
}

interface FlightSeed {
  readonly flightNumber: string;
  readonly aircraftTypeName: string;
  readonly departureTime: Date;
}

interface PassengerSeed {
  readonly firstName: string;
  readonly lastName: string;
  readonly email: string;
}

const AIRCRAFT_TYPES: readonly AircraftTypeSeed[] = [
  { name: 'A320', rows: 30, columns: 'A,B,C,D,E,F' },
  { name: 'B737', rows: 33, columns: 'A,B,C,D,E,F' },
  { name: 'A380', rows: 50, columns: 'A,B,C,D,E,F,G,H,J,K' },
] as const;

const FLIGHTS: readonly FlightSeed[] = [
  {
    flightNumber: 'SH-1042',
    aircraftTypeName: 'A320',
    departureTime: new Date(Date.now() + 24 * 60 * 60 * 1000),
  },
  {
    flightNumber: 'SH-2085',
    aircraftTypeName: 'B737',
    departureTime: new Date(Date.now() + 48 * 60 * 60 * 1000),
  },
  {
    flightNumber: 'SH-3001',
    aircraftTypeName: 'A380',
    departureTime: new Date(Date.now() + 72 * 60 * 60 * 1000),
  },
] as const;

const PASSENGERS: readonly PassengerSeed[] = [
  { firstName: 'Alice', lastName: 'Johnson', email: 'alice.johnson@example.com' },
  { firstName: 'Bob', lastName: 'Smith', email: 'bob.smith@example.com' },
  { firstName: 'Charlie', lastName: 'Brown', email: 'charlie.brown@example.com' },
  { firstName: 'Diana', lastName: 'Prince', email: 'diana.prince@example.com' },
  { firstName: 'Edward', lastName: 'Norton', email: 'edward.norton@example.com' },
  { firstName: 'Fiona', lastName: 'Apple', email: 'fiona.apple@example.com' },
  { firstName: 'George', lastName: 'Miller', email: 'george.miller@example.com' },
  { firstName: 'Hannah', lastName: 'Lee', email: 'hannah.lee@example.com' },
  { firstName: 'Ivan', lastName: 'Petrov', email: 'ivan.petrov@example.com' },
  { firstName: 'Julia', lastName: 'Roberts', email: 'julia.roberts@example.com' },
] as const;

const generateSeatsForFlight = (
  flightId: string,
  aircraftType: AircraftType,
): Partial<Seat>[] => {
  const columns = aircraftType.columns.split(',');
  const seats: Partial<Seat>[] = [];
  for (let row = 1; row <= aircraftType.rows; row++) {
    for (const col of columns) {
      seats.push({
        flightId,
        row,
        column: col,
        status: SeatStatus.AVAILABLE,
        heldBy: null,
        heldAt: null,
      });
    }
  }
  return seats;
};

const seed = async (): Promise<void> => {
  const dataSource = new DataSource(dataSourceOptions);
  await dataSource.initialize();
  console.log('Database connected.');
  const queryRunner = dataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();
  try {
    const aircraftTypeRepo = queryRunner.manager.getRepository(AircraftType);
    const flightRepo = queryRunner.manager.getRepository(Flight);
    const passengerRepo = queryRunner.manager.getRepository(Passenger);
    const seatRepo = queryRunner.manager.getRepository(Seat);
    const existingAircraftTypes = await aircraftTypeRepo.count();
    if (existingAircraftTypes > 0) {
      console.log('Seed data already exists. Skipping.');
      await queryRunner.rollbackTransaction();
      await dataSource.destroy();
      return;
    }
    console.log('Seeding aircraft types...');
    const savedAircraftTypes = await aircraftTypeRepo.save(
      AIRCRAFT_TYPES.map((at) => aircraftTypeRepo.create(at)),
    );
    const aircraftTypeMap = new Map<string, AircraftType>(
      savedAircraftTypes.map((at) => [at.name, at]),
    );
    console.log(`  Created ${savedAircraftTypes.length} aircraft types.`);
    console.log('Seeding flights...');
    const savedFlights = await flightRepo.save(
      FLIGHTS.map((f) => {
        const aircraftType = aircraftTypeMap.get(f.aircraftTypeName);
        if (!aircraftType) {
          throw new Error(`Aircraft type ${f.aircraftTypeName} not found`);
        }
        return flightRepo.create({
          flightNumber: f.flightNumber,
          aircraftTypeId: aircraftType.id,
          departureTime: f.departureTime,
          status: FlightStatus.SCHEDULED,
        });
      }),
    );
    console.log(`  Created ${savedFlights.length} flights.`);
    console.log('Seeding seats...');
    let totalSeats = 0;
    for (const flight of savedFlights) {
      const aircraftType = savedAircraftTypes.find(
        (at) => at.id === flight.aircraftTypeId,
      );
      if (!aircraftType) {
        throw new Error(`Aircraft type not found for flight ${flight.flightNumber}`);
      }
      const seatData = generateSeatsForFlight(flight.id, aircraftType);
      await seatRepo.save(seatData.map((s) => seatRepo.create(s)));
      totalSeats += seatData.length;
      console.log(
        `  Flight ${flight.flightNumber}: ${seatData.length} seats (${aircraftType.name})`,
      );
    }
    console.log(`  Created ${totalSeats} total seats.`);
    console.log('Seeding passengers...');
    const savedPassengers = await passengerRepo.save(
      PASSENGERS.map((p) => passengerRepo.create(p)),
    );
    console.log(`  Created ${savedPassengers.length} passengers.`);
    await queryRunner.commitTransaction();
    console.log('Seed completed successfully.');
  } catch (error) {
    console.error('Seed failed, rolling back...', error);
    await queryRunner.rollbackTransaction();
    throw error;
  } finally {
    await queryRunner.release();
    await dataSource.destroy();
  }
};

seed().catch((error) => {
  console.error('Seed error:', error);
  process.exit(1);
});
