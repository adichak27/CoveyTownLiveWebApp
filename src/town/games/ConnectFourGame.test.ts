import { Console } from 'console';
import {
  GAME_FULL_MESSAGE,
  PLAYER_ALREADY_IN_GAME_MESSAGE, 
  PLAYER_NOT_IN_GAME_MESSAGE,
  GAME_NOT_IN_PROGRESS_MESSAGE, 
  MOVE_NOT_YOUR_TURN_MESSAGE, 
  BOARD_POSITION_NOT_VALID_MESSAGE, 
  GAME_NOT_STARTABLE_MESSAGE
} from '../../lib/InvalidParametersError';
import { createPlayerForTesting } from '../../TestUtils';
import { ConnectFourMove, GameMove } from '../../types/CoveyTownSocket';
import {
  ConnectFourColIndex,
  ConnectFourColor,
  ConnectFourRowIndex,
} from '../../types/CoveyTownSocket';
import ConnectFourGame from './ConnectFourGame';

const logger = new Console(process.stdout, process.stderr);

/**
 * A helper function to apply a pattern of moves to a game.
 * The pattern is a 2-d array of Y, R or _.
 * Y and R indicate that a move should be made by the yellow or red player respectively.
 * _ indicates that no move should be made.
 * The pattern is applied from the bottom left to the top right, going across the rows
 *
 * Note that there are valid game boards that *can not* be created by this function, as it does not
 * search for all possible orderings of applying the moves. It might get stuck in a situation where
 * it can't make a move, because it hasn't made the move that would allow it to make the next move.
 *
 * If it fails, it will print to the console the pattern and the moves that were made, and throw an error.
 *
 * @param game Game to apply the pattern to
 * @param pattern Board pattern to apply
 * @param redID ID of the red player
 * @param yellowID ID of the yellow player
 * @param firstColor The color of the first player to make a move
 */
function createMovesFromPattern(
  game: ConnectFourGame,
  pattern: string[][],
  redID: string,
  yellowID: string,
  firstColor: ConnectFourColor,
) {
  type QueuedMove = { rowIdx: ConnectFourRowIndex; colIdx: ConnectFourColIndex };
  const queues = {
    Yellow: [] as QueuedMove[],
    Red: [] as QueuedMove[],
  };

  // Construct the queues of moves to make from the board pattern
  pattern.forEach((row, rowIdx) => {
    row.forEach((col, colIdx) => {
      if (col === 'Y') {
        queues.Yellow.push({
          rowIdx: rowIdx as ConnectFourRowIndex,
          colIdx: colIdx as ConnectFourColIndex,
        });
      } else if (col === 'R') {
        queues.Red.push({
          rowIdx: rowIdx as ConnectFourRowIndex,
          colIdx: colIdx as ConnectFourColIndex,
        });
      } else if (col !== '_') {
        throw new Error(`Invalid pattern: ${pattern}, expecting 2-d array of Y, R or _`);
      }
    });
  });

  // sort the queue so that the moves are made from the left to the right, then bottom to up
  const queueSorter = (a: QueuedMove, b: QueuedMove) => {
    function cellNumber(move: QueuedMove) {
      return 6 * (5 - move.rowIdx) + move.colIdx;
    }
    return cellNumber(a) - cellNumber(b);
  };
  queues.Yellow.sort(queueSorter);
  queues.Red.sort(queueSorter);

  const colHeights = [5, 5, 5, 5, 5, 5, 5];
  const movesMade: string[][] = [[], [], [], [], [], []];
  // Helper function to make a move
  const makeMove = (color: ConnectFourColor) => {
    // Finds the first move in the queue that can be made and makes it
    const queue = queues[color];
    if (queue.length === 0) return;
    for (const move of queue) {
      if (move.rowIdx === colHeights[move.colIdx]) {
        // we can make this!
        game.applyMove({
          gameID: game.id,
          move: {
            gamePiece: color,
            col: move.colIdx,
            row: move.rowIdx,
          },
          playerID: color === 'Red' ? redID : yellowID,
        });
        movesMade[move.rowIdx][move.colIdx] = color === 'Red' ? 'R' : 'Y';
        queues[color] = queue.filter(m => m !== move);
        colHeights[move.colIdx] -= 1;
        return;
      }
    }
    // If we get here, we couldn't make any moves
    logger.table(pattern);
    logger.table(movesMade);
    throw new Error(
      `Unable to apply pattern: ${JSON.stringify(pattern, null, 2)}
      If this is a pattern in the autograder: are you sure that you checked for game-ending conditions? If this is a pattern you provided: please double-check your pattern - it may be invalid.`,
    );
  };
  const gameOver = () => game.state.status === 'OVER';
  while (queues.Yellow.length > 0 || queues.Red.length > 0) {
    // Try to make a move for the first player in the queue
    makeMove(firstColor);
    // If the game is over, return
    if (gameOver()) return;

    // Try to make a move for the second player in the queue
    makeMove(firstColor === 'Red' ? 'Yellow' : 'Red');
    if (gameOver()) return;
  }
}

describe('ConnectFourGame', () => {
  let game: ConnectFourGame;
  beforeEach(() => {
    game = new ConnectFourGame();
  });
  describe('_join', () => {
    it('should throw an error if the player is already in the game', () => {
      const player = createPlayerForTesting();
      game.join(player);
      expect(() => game.join(player)).toThrowError(PLAYER_ALREADY_IN_GAME_MESSAGE);
      const player2 = createPlayerForTesting();
      game.join(player2);
      expect(() => game.join(player2)).toThrowError(PLAYER_ALREADY_IN_GAME_MESSAGE);
    });
    it('should test the default values of a new game to ensure there are no mutations', () => {
      const newGame = new ConnectFourGame();
      expect(newGame.state.status).toBe('WAITING_FOR_PLAYERS');
      expect(newGame.state.red).toBeUndefined();
      expect(newGame.state.yellow).toBeUndefined();
      expect(newGame.state.redReady).toBe(undefined);
      expect(newGame.state.yellowReady).toBe(undefined);
      expect(newGame.state.firstPlayer).toBe('Red');
      expect(newGame.state.winner).toBeUndefined();
      expect(newGame.state.moves).toEqual([]);
    });
    it('should throw an error if the player is not in the game but the game is full', () => {
      const player1 = createPlayerForTesting();
      const player2 = createPlayerForTesting();
      const player3 = createPlayerForTesting();
      game.join(player1);
      game.join(player2);

      expect(() => game.join(player3)).toThrowError(GAME_FULL_MESSAGE);
    });
    it('should change the game status to WAITING_TO_START if both players joined', () => {
      const player1 = createPlayerForTesting();
      const player2 = createPlayerForTesting();
      game.join(player1);
      game.join(player2);
      expect(game.state.status).toBe('WAITING_TO_START');
    });
    it('should add player as yellow if yellow in previous game', () => {
      let priorGame = new ConnectFourGame();
      const red = createPlayerForTesting();
      const yellow = createPlayerForTesting();
      priorGame.join(red);
      priorGame.join(yellow);
      expect(priorGame.state.yellow).toBe(yellow.id);
      
      let currentGame = new ConnectFourGame(priorGame);
      currentGame.join(red);
      currentGame.join(yellow);

      expect(currentGame.state.red).toBe(red.id);
      expect(currentGame.state.yellow).toBe(yellow.id);
    });

    test('If red player leaves and a preferred yellow player joins, they should be given the color red', () => {
      const red = createPlayerForTesting();
      const yellow = createPlayerForTesting();
      const player3 = createPlayerForTesting();

      let priorGame = new ConnectFourGame();
      priorGame.join(red);
      priorGame.join(yellow);
      
      let currentGame = new ConnectFourGame(priorGame);
      currentGame.join(red);
      currentGame.join(player3);
      currentGame.startGame(red);
      expect(currentGame.state.status).toBe('WAITING_TO_START');

      currentGame.leave(red);
      expect(currentGame.state.status).toBe('WAITING_FOR_PLAYERS');
      currentGame.join(yellow);
      
      expect(currentGame.state.red).toEqual(yellow.id);
    });
  });
  describe('startGame', () => {
    const red = createPlayerForTesting();
    const yellow = createPlayerForTesting();
    const player3 = createPlayerForTesting();
    beforeEach(() => {
      game.join(red);
      game.join(yellow);
      game.startGame(red);
      game.startGame(yellow);
    });
    describe('Determining who is the first player', () => {
      test('If there is no prior game, the first player is red', () => {
        expect(game.state.firstPlayer).toBe('Red');
      });
      test('If both players was in the previous game, sets first player to the opposite color', () => {
        let newGame = new ConnectFourGame(game);
        newGame.join(yellow);
        newGame.join(red);
        newGame.startGame(yellow);
        newGame.startGame(red);

        expect(newGame.state.firstPlayer).toBe('Yellow');
      });
      test('If one player was in the previous game, sets first player to the opposite color', () => {
        let newGame = new ConnectFourGame(game);
        newGame.join(yellow);
        newGame.join(player3);
        newGame.startGame(yellow);
        newGame.startGame(player3);

        expect(newGame.state.firstPlayer).toBe('Yellow');
      });
      test('If there was a prior game, but current players were not in the game, firstplayer should be red', () => {
        let newGame = new ConnectFourGame(game);
        const player4 = createPlayerForTesting();
        newGame.join(player3);
        newGame.join(player4);
        newGame.startGame(player3);
        newGame.startGame(player4);

        expect(newGame.state.firstPlayer).toBe('Red');
      });

    });
    describe('Should throw the correct error when called with invalid parameters', () => {
      test('If player is not in the game, should throw PLAYER_NOT_IN_GAME_MESSAGE', () => {
        let newGame = new ConnectFourGame(game);
        newGame.join(yellow);
        newGame.join(red);
        expect(() => newGame.startGame(player3)).toThrowError(PLAYER_NOT_IN_GAME_MESSAGE);
      });
      test('If game is not in WAITING_TO_START state, should throw GAME_NOT_STARTABLE_MESSAGE', () => {
        let newGame = new ConnectFourGame(game);
        newGame.join(yellow);
        expect(() => newGame.startGame(yellow)).toThrowError(GAME_NOT_STARTABLE_MESSAGE);
      })
    });
  });
  describe('_leave', () => {
    const red = createPlayerForTesting();
    const yellow = createPlayerForTesting();
    beforeEach(() => {
      game.join(red);
      game.join(yellow);
      game.startGame(red);
      game.startGame(yellow);
    });
    describe('Determining the winner and game status when a player leaves', () => {
      test('If red player leaves when game in progress, sets winner to the yellow player', () => {
        game.leave(red);
        expect(game.state.winner).toEqual(yellow.id);
        expect(game.state.status).toBe('OVER');
      });
      test('if gamestate is unchanged when player leaves and status is WAITING_FOR_PLAYERS', () => {
        let newGame = new ConnectFourGame();
        newGame.join(red);
        expect(newGame.state.status).toBe('WAITING_FOR_PLAYERS');
        newGame.leave(red);
        expect(newGame.state.status).toBe('WAITING_FOR_PLAYERS');
      });
      test('If yellow player leaves when game in progress, updates game status to OVER and sets winner to the red player', () => {
        game.leave(yellow);
        expect(game.state.winner).toEqual(red.id);
        expect(game.state.status).toBe('OVER');
      });
      test('If a player leaves when game in progress, updates game status to OVER and sets winner to the red player', () => {
        let newGame = new ConnectFourGame();
        newGame.join(red);
        newGame.join(yellow);
        newGame.leave(yellow);
        expect(newGame.state.status).toBe('WAITING_FOR_PLAYERS');
        expect(newGame.state.yellow).toBeUndefined();
        expect(newGame.state.yellowReady).toBe(false);
      });
      
      test('should throw error if player is not in game', () => {
        const player3 = createPlayerForTesting();
        expect(() => game.leave(player3)).toThrowError(PLAYER_NOT_IN_GAME_MESSAGE);
      });
      test('if status is WAITING_TO_START when player leaves, game stutus should update to WAITING_FOR_PLAYERS', () => {
        let newGame = new ConnectFourGame();
        newGame.join(red);
        newGame.join(yellow);
        newGame.startGame(red);
        expect(newGame.state.status).toBe('WAITING_TO_START');
        newGame.leave(red);
        expect(newGame.state.status).toBe('WAITING_FOR_PLAYERS');
        expect(newGame.state.redReady).toBe(false);
        expect(newGame.state.red).toBe(undefined);
      });
      it('if gamestate is unchanged when player leaves and status is OVER', () => {
        createMovesFromPattern(
          game,
          [
            ['Y', 'R', 'Y', 'R', 'Y', 'R', 'Y'],
            ['R', 'Y', 'R', 'Y', 'R', 'Y', 'R'],
            ['R', 'Y', 'R', 'Y', 'R', 'Y', 'R'],
            ['Y', 'R', 'Y', 'R', 'Y', 'R', 'Y'],
            ['Y', 'R', 'Y', 'R', 'Y', 'R', 'Y'],
            ['R', 'Y', 'R', 'Y', 'R', 'Y', 'R'],
          ],
          red.id,
          yellow.id,
          'Red',
        );
        expect(game.state.status).toBe('OVER');
        game.leave(yellow);
        expect(game.state.status).toBe('OVER');
        expect(game.state.yellow).toEqual(yellow.id);
      });
    });
  });
  describe('applyMove', () => {
    const red = createPlayerForTesting();
    const yellow = createPlayerForTesting();
    beforeEach(() => {
      game.join(red);
      game.join(yellow);
      game.startGame(red);
      game.startGame(yellow);
    });

    describe('Determining who is the first player', () => {
      test('If there is no prior game, the first player is red', () => {
        expect(game.state.firstPlayer).toBe('Red');
      });
    });
    describe('when given an invalid move, should throw the appropriate error', () => {
      test('If game is not in progress, throws GAME_NOT_IN_PROGRESS_MESSAGE', () => {
        game.leave(yellow);
        let connectFourMove: ConnectFourMove;
        connectFourMove = {
          gamePiece: 'Red',
          col: 3,
          row: 5
        };
        let gameMove: GameMove<ConnectFourMove>;
        gameMove = {
          playerID: red.id,
          gameID: game.id,
          move: connectFourMove
        }
        expect(() => game.applyMove(gameMove)).toThrowError(GAME_NOT_IN_PROGRESS_MESSAGE);
      });
      test('If player not in game, throws PLAYER_NOT_IN_GAME_MESSAGE', () => {
        const player3 = createPlayerForTesting();
        let connectFourMove: ConnectFourMove;
        connectFourMove = {
          gamePiece: 'Red',
          col: 3,
          row: 5
        };
        let gameMove: GameMove<ConnectFourMove>;
        gameMove = {
          playerID: player3.id,
          gameID: game.id,
          move: connectFourMove
        }
        expect(() => game.applyMove(gameMove)).toThrowError(PLAYER_NOT_IN_GAME_MESSAGE);
      });
      test('If not players turn, throws MOVE_NOT_YOUR_TURN_MESSAGE', () => {
        let connectFourMove: ConnectFourMove;
        connectFourMove = {
          gamePiece: 'Red',
          col: 3,
          row: 5
        };
        let gameMove: GameMove<ConnectFourMove>;
        gameMove = {
          playerID: yellow.id,
          gameID: game.id,
          move: connectFourMove
        }
        expect(() => game.applyMove(gameMove)).toThrowError(MOVE_NOT_YOUR_TURN_MESSAGE);
      });
      
      test('If move is not on an empty space, throws BOARD_POSITION_NOT_VALID_MESSAGE', () => {
        let connectFourMove: ConnectFourMove;
        connectFourMove = {
          gamePiece: 'Red',
          col: 3,
          row: 5
        };
        let gameMove: GameMove<ConnectFourMove>;
        gameMove = {
          playerID: red.id,
          gameID: game.id,
          move: connectFourMove
        }

        let connectFourMove2: ConnectFourMove;
        connectFourMove2 = {
          gamePiece: 'Yellow',
          col: 3,
          row: 5
        };
        let gameMove2: GameMove<ConnectFourMove>;
        gameMove2 = {
          playerID: yellow.id,
          gameID: game.id,
          move: connectFourMove2
        }
        game.applyMove(gameMove);
        expect(() => game.applyMove(gameMove2)).toThrowError(BOARD_POSITION_NOT_VALID_MESSAGE);
      });
      test('If move does not have a gamePiece directly below it, throws BOARD_POSITION_NOT_VALID_MESSAGE', () => {
        createMovesFromPattern(
          game,
          [
            ['_', '_', '_', '_', '_', '_', '_'],
            ['_', '_', '_', '_', '_', '_', '_'],
            ['_', '_', '_', '_', '_', '_', '_'],
            ['_', '_', '_', '_', '_', '_', '_'],
            ['_', 'Y', 'Y', '_', '_', '_', '_'],
            ['_', 'R', 'R', '_', '_', '_', '_'],
          ],
          red.id,
          yellow.id,
          'Red',
        );
        let connectFourMove: ConnectFourMove;
        connectFourMove = {
          gamePiece: 'Red',
          col: 2,
          row: 2
        };
        let gameMove: GameMove<ConnectFourMove>;
        gameMove = {
          playerID: red.id,
          gameID: game.id,
          move: connectFourMove
        }
        expect(() => game.applyMove(gameMove)).toThrowError(BOARD_POSITION_NOT_VALID_MESSAGE);
      });
    });
    describe('when given a move that does not win the game, it does not end it', () => {
      test('Sample Test', () => {
        createMovesFromPattern(
          game,
          [
            ['_', '_', '_', '_', '_', '_', '_'],
            ['_', '_', '_', '_', '_', '_', '_'],
            ['_', '_', '_', '_', '_', '_', '_'],
            ['_', '_', '_', '_', '_', '_', '_'],
            ['_', 'Y', 'Y', '_', '_', '_', '_'],
            ['_', 'R', 'R', '_', '_', '_', '_'],
          ],
          red.id,
          yellow.id,
          'Red',
        );
        expect(game.state.status).toBe('IN_PROGRESS');
        expect(game.state.winner).toBeUndefined();
      });
      test('Getting several in a row vertically does not end the game', () => {
        createMovesFromPattern(
          game,
          [
            ['_', '_', '_', '_', '_', '_', '_'],
            ['R', '_', 'R', 'Y', '_', '_', 'Y'],
            ['Y', '_', 'R', 'Y', '_', '_', 'R'],
            ['R', '_', 'R', 'R', '_', '_', 'Y'],
            ['R', '_', 'Y', 'Y', '_', '_', 'Y'],
            ['R', '_', 'R', 'Y', '_', '_', 'Y'],
          ],
          red.id,
          yellow.id,
          'Red',
        );
        expect(game.state.status).toBe('IN_PROGRESS');
        expect(game.state.winner).toBeUndefined();
      });
      it('should not end the game even when next move is winning horizontally or vertically', () => {
        createMovesFromPattern(
          game,
          [
            ['R', 'R', 'Y', 'Y', 'Y', '_', 'R'],
            ['R', 'Y', 'R', 'R', 'R', 'Y', 'Y'],
            ['R', 'Y', 'R', 'Y', 'R', 'Y', 'R'],
            ['Y', 'R', 'Y', 'R', 'Y', 'Y', 'R'],
            ['Y', 'R', 'Y', 'R', 'Y', 'R', 'Y'],
            ['R', 'Y', 'R', 'Y', 'R', 'Y', 'R'],
          ],
          red.id,
          yellow.id,
          'Red',
        );
        expect(game.state.status).toBe('IN_PROGRESS');
        expect(game.state.winner).toBeUndefined();
        expect(game.state.moves.length).toBe(41);
      });
      it('should not end the game even when next move is winning top left to bottom right', () => {
        createMovesFromPattern(
          game,
          [
            ['R', '_', 'Y', 'R', 'Y', 'R', 'Y'],
            ['R', 'R', 'Y', 'R', 'R', 'Y', 'Y'],
            ['R', 'Y', 'R', 'Y', 'R', 'Y', 'R'],
            ['Y', 'R', 'Y', 'Y', 'Y', 'R', 'R'],
            ['Y', 'R', 'Y', 'R', 'Y', 'R', 'Y'],
            ['R', 'Y', 'R', 'Y', 'R', 'Y', 'R'],
          ],
          red.id,
          yellow.id,
          'Red',
        );
        expect(game.state.status).toBe('IN_PROGRESS');
        expect(game.state.winner).toBeUndefined();
        expect(game.state.moves.length).toBe(41);
      });
      it('should not end the game even when next move is winning bottom left to top right', () => {
        createMovesFromPattern(
          game,
          [
            ['R', 'Y', 'Y', 'R', 'Y', 'R', '_'],
            ['R', 'R', 'Y', 'R', 'R', 'Y', 'Y'],
            ['R', 'Y', 'R', 'R', 'Y', 'Y', 'R'],
            ['Y', 'R', 'Y', 'Y', 'Y', 'R', 'R'],
            ['Y', 'Y', 'R', 'R', 'Y', 'R', 'Y'],
            ['R', 'Y', 'R', 'Y', 'R', 'Y', 'R'],
          ],
          red.id,
          yellow.id,
          'Red',
        );
        expect(game.state.status).toBe('IN_PROGRESS');
        expect(game.state.winner).toBeUndefined();
        expect(game.state.moves.length).toBe(41);
      });
      test('Getting several in a row horizontally does not end the game', () => {
        createMovesFromPattern(
          game,
          [
            ['_', '_', '_', '_', '_', '_', '_'],
            ['_', '_', '_', '_', '_', '_', '_'],
            ['_', '_', '_', '_', '_', '_', '_'],
            ['_', '_', '_', '_', '_', '_', '_'],
            ['_', 'Y', 'Y', 'Y', 'R', '_', '_'],
            ['_', 'R', 'R', 'R', 'Y', 'R', '_'],
          ],
          red.id,
          yellow.id,
          'Red',
        );
        expect(game.state.status).toBe('IN_PROGRESS');
        expect(game.state.winner).toBeUndefined();
      });
      test('Getting several in a row bottom left to top right does not end the game', () => {
        createMovesFromPattern(
          game,
          [
            ['_', '_', '_', '_', '_', '_', '_'],
            ['_', '_', '_', '_', '_', '_', '_'],
            ['_', '_', '_', '_', 'Y', '_', '_'],
            ['_', '_', '_', 'R', 'R', '_', '_'],
            ['_', '_', 'R', 'Y', 'Y', '_', '_'],
            ['_', 'R', 'Y', 'Y', 'R', '_', '_'],
          ],
          red.id,
          yellow.id,
          'Red',
        );
        expect(game.state.status).toBe('IN_PROGRESS');
        expect(game.state.winner).toBeUndefined();
      });
      test('Getting several in a row top left to bottom right does not end the game', () => {
        createMovesFromPattern(
          game,
          [
            ['_', '_', '_', '_', '_', '_', '_'],
            ['_', '_', '_', '_', '_', '_', '_'],
            ['Y', '_', '_', '_', '_', '_', '_'],
            ['R', 'Y', '_', '_', '_', '_', '_'],
            ['Y', 'R', 'Y', '_', '_', '_', '_'],
            ['R', 'R', 'Y', 'R', '_', '_', '_'],
          ],
          red.id,
          yellow.id,
          'Red',
        );
        expect(game.state.status).toBe('IN_PROGRESS');
        expect(game.state.winner).toBeUndefined();
      });

    });
    describe('when given a move that wins the game, it ends the game and updates the winner', () => {
      it('should end the game when four in a row is achieved horizontally', () => {
        createMovesFromPattern(
          game,
          [
            ['_', '_', '_', '_', '_', '_', '_'],
            ['_', '_', '_', '_', '_', '_', '_'],
            ['_', '_', '_', '_', '_', '_', '_'],
            ['_', '_', '_', '_', '_', '_', '_'],
            ['_', '_', '_', '_', '_', '_', '_'],
            ['R', 'R', 'R', 'R', 'Y', 'Y', 'Y'],
          ],
          red.id,
          yellow.id,
          'Red',
        );
        expect(game.state.status).toBe('OVER');
        expect(game.state.winner).toEqual(red.id);
      }); 

      it('should end the game when four in a row is achieved vertically', () => {
        let newGame = new ConnectFourGame(game);
        newGame.join(red);
        newGame.join(yellow);
        newGame.startGame(red);
        newGame.startGame(yellow);
        createMovesFromPattern(
          newGame,
          [
            ['_', '_', '_', '_', '_', '_', '_'],
            ['_', '_', '_', '_', '_', '_', '_'],
            ['_', '_', '_', '_', '_', '_', 'R'],
            ['Y', '_', '_', '_', '_', '_', 'R'],
            ['Y', '_', '_', '_', '_', '_', 'R'],
            ['Y', 'Y', 'Y', 'R', 'R', 'Y', 'R'],
          ],
          red.id,
          yellow.id,
          'Yellow',
        );
        expect(newGame.state.status).toBe('OVER');
        expect(newGame.state.winner).toEqual(red.id);
      });
      it('should end the game when four in a row is achieved vertically in the first column', () => {
        let newGame = new ConnectFourGame(game);
        newGame.join(red);
        newGame.join(yellow);
        newGame.startGame(red);
        newGame.startGame(yellow);
        createMovesFromPattern(
          newGame,
          [
            ['Y', '_', '_', '_', '_', '_', '_'],
            ['Y', '_', '_', '_', '_', '_', '_'],
            ['Y', '_', '_', '_', '_', '_', '_'],
            ['Y', '_', '_', '_', '_', '_', '_'],
            ['R', 'R', '_', 'R', '_', 'R', '_'],
            ['Y', 'Y', 'Y', 'R', 'R', 'R', 'Y'],
          ],
          red.id,
          yellow.id,
          'Yellow',
        );
        expect(newGame.state.status).toBe('OVER');
        expect(newGame.state.winner).toEqual(yellow.id);
      });

      it('should end the game when four in a row is achieved diagnolly bottem left to top right', () => {
        createMovesFromPattern(
          game,
          [
            ['_', '_', '_', '_', '_', '_', '_'],
            ['_', '_', '_', '_', '_', '_', '_'],
            ['_', '_', '_', '_', '_', '_', 'Y'],
            ['_', '_', '_', '_', '_', 'Y', 'R'],
            ['R', '_', '_', '_', 'Y', 'R', 'R'],
            ['Y', 'R', 'Y', 'Y', 'Y', 'R', 'R'],
          ],
          red.id,
          yellow.id,
          'Red',
        );
        expect(game.state.status).toBe('OVER');
        expect(game.state.winner).toEqual(yellow.id);
      });
      it('should end the game when four in a row is achieved diagnolly top left to bottom right', () => {
        createMovesFromPattern(
          game,
          [
            ['_', '_', '_', '_', '_', '_', '_'],
            ['_', '_', '_', '_', '_', '_', '_'],
            ['R', '_', '_', '_', '_', '_', '_'],
            ['R', 'R', 'Y', '_', '_', '_', '_'],
            ['Y', 'Y', 'R', 'Y', '_', '_', '_'],
            ['R', 'Y', 'R', 'R', 'Y', 'R', 'Y'],
          ],
          red.id,
          yellow.id,
          'Red',
        );
        expect(game.state.status).toBe('OVER');
        expect(game.state.winner).toEqual(red.id);
      });
      it('should end the game as a tie when the board is full', () => {
        createMovesFromPattern(
          game,
          [
            ['Y', 'R', 'Y', 'R', 'Y', 'R', 'Y'],
            ['R', 'Y', 'R', 'Y', 'R', 'Y', 'R'],
            ['R', 'Y', 'R', 'Y', 'R', 'Y', 'R'],
            ['Y', 'R', 'Y', 'R', 'Y', 'R', 'Y'],
            ['Y', 'R', 'Y', 'R', 'Y', 'R', 'Y'],
            ['R', 'Y', 'R', 'Y', 'R', 'Y', 'R'],
          ],
          red.id,
          yellow.id,
          'Red',
        );
        expect(game.state.status).toBe('OVER');
        expect(game.state.winner).toBeUndefined();
        expect(game.state.moves.length).toBe(42);
      });
    });
  });
});
