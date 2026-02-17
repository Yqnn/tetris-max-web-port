// High scores (10 entries max, stored in localStorage)
export const HIGH_SCORE_COUNT = 10;

// High score entry
export type HighScore = {
  name: string;
  score: number;
  rows: number;
  date: string;
};

export function loadHighScores(): HighScore[] {
  let highScores: HighScore[] = [];
  try {
    const stored = localStorage.getItem('tetrisMaxHighScores');
    if (stored) {
      highScores = JSON.parse(stored);
    } else {
      highScores = [];
      for (let i = 0; i < HIGH_SCORE_COUNT; i++) {
        highScores.push({
          name: 'Anonymous',
          score: 0,
          rows: 0,
          date: new Date('1970-01-01').toISOString(),
        });
      }
    }
  } catch (e) {
    console.log('Failed to load high scores:', e);
    highScores = [];
  }
  return highScores;
}

export function saveHighScores(highScores: HighScore[]) {
  try {
    localStorage.setItem('tetrisMaxHighScores', JSON.stringify(highScores));
  } catch (e) {
    console.log('Failed to save high scores:', e);
  }
}

export const isHighScore = (
  highScores: HighScore[],
  newScore: number
): boolean => {
  return (
    newScore > 0 &&
    highScores.findIndex(({ score }) => newScore >= score) !== -1
  );
};

export function addHighScore(
  highScores: HighScore[],
  newScore: Omit<HighScore, 'date'>
): number {
  const index = highScores.findIndex(({ score }) => newScore.score >= score);
  const newEntry = {
    ...newScore,
    date: new Date().toISOString(),
  };
  for (let j = HIGH_SCORE_COUNT - 1; j > index; j--) {
    highScores[j] = highScores[j - 1];
  }
  highScores[index] = newEntry;
  saveHighScores(highScores);
  return index;
}
