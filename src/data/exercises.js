const G = {
  Chest: ['Bench press', 'Incline bench press', 'Decline bench press', 'Dumbbell bench press', 'Incline dumbbell press', 'Chest fly machine', 'Dumbbell fly', 'Cable crossover', 'Chest press machine', 'Push-up', 'Dips'],
  Back: ['Deadlift', 'Pull-up', 'Chin-up', 'Lat pulldown', 'Barbell row', 'Dumbbell row', 'Seated cable row', 'T-bar row', 'Face pull', 'Straight-arm pulldown', 'Back extension', 'Rack pull'],
  Shoulders: ['Overhead press', 'Dumbbell shoulder press', 'Machine shoulder press', 'Lateral raise', 'Cable lateral raise', 'Front raise', 'Rear delt fly', 'Upright row', 'Shrug'],
  Biceps: ['Barbell curl', 'Dumbbell curl', 'Hammer curl', 'Preacher curl', 'Cable curl', 'Incline dumbbell curl', 'Concentration curl'],
  Triceps: ['Triceps pushdown', 'Overhead triceps extension', 'Skull crusher', 'Close-grip bench press', 'Rope pushdown', 'Bench dip'],
  Legs: ['Squat', 'Front squat', 'Leg press', 'Hack squat', 'Romanian deadlift', 'Leg extension', 'Leg curl', 'Walking lunge', 'Bulgarian split squat', 'Goblet squat', 'Hip thrust', 'Glute bridge', 'Standing calf raise', 'Seated calf raise'],
  Core: ['Plank', 'Crunch', 'Hanging leg raise', 'Cable crunch', 'Russian twist', 'Ab wheel rollout', 'Mountain climber'],
};
const CARDIO = ['Treadmill', 'Running', 'Walking', 'Cycling', 'Elliptical', 'Rowing machine', 'Stair climber', 'Skipping', 'Swimming'];
export const BUILTIN_EXERCISES = [
  ...Object.entries(G).flatMap(([muscle, names]) => names.map((name) => ({ name, muscle, kind: 'weight' }))),
  ...CARDIO.map((name) => ({ name, muscle: 'Cardio', kind: 'cardio' })),
];
export const MUSCLES = [...Object.keys(G), 'Cardio'];
const r = (name, list) => ({ name, items: list.map(([e, sets, reps]) => ({ name: e, sets, reps })) });
export const STARTER_ROUTINES = [
  r('Push', [['Bench press', 3, 8], ['Incline dumbbell press', 3, 10], ['Dumbbell shoulder press', 3, 10], ['Lateral raise', 3, 15], ['Triceps pushdown', 3, 12]]),
  r('Pull', [['Lat pulldown', 3, 10], ['Barbell row', 3, 8], ['Seated cable row', 3, 10], ['Face pull', 3, 15], ['Barbell curl', 3, 10], ['Hammer curl', 2, 12]]),
  r('Legs', [['Squat', 3, 6], ['Romanian deadlift', 3, 8], ['Leg press', 3, 10], ['Leg curl', 3, 12], ['Standing calf raise', 3, 15], ['Plank', 3, 1]]),
];
