import Player from '../../lib/Player';
import { ConnectFourGameState, ConnectFourMove, GameMove } from '../../types/CoveyTownSocket';
import Game from './Game';
import {
  PLAYER_ALREADY_IN_GAME_MESSAGE,
  GAME_FULL_MESSAGE,
  PLAYER_NOT_IN_GAME_MESSAGE, 
  GAME_NOT_STARTABLE_MESSAGE, 
  GAME_NOT_IN_PROGRESS_MESSAGE, 
  MOVE_NOT_YOUR_TURN_MESSAGE, 
  BOARD_POSITION_NOT_VALID_MESSAGE
} from '../../lib/InvalidParametersError';

/**
 * A ConnectFourGame is a Game that implements the rules of Connect Four.
 * @see https://en.wikipedia.org/wiki/Connect_Four
 */
export default class ConnectFourGame extends Game<ConnectFourGameState, ConnectFourMove> {
  private priorGame: ConnectFourGame | undefined;

  private get _board() {
    const { moves } = this.state;
    const board = [
      ['', '', '', '', '', '', ''],
      ['', '', '', '', '', '', ''],
      ['', '', '', '', '', '', ''],
      ['', '', '', '', '', '', ''],
      ['', '', '', '', '', '', ''],
      ['', '', '', '', '', '', '']
    ];
    for (const move of moves) {
      if (move.gamePiece === 'Red') {
        board[move.row][move.col] = 'R';
      } else {
        board[move.row][move.col] = 'Y';
      }
    }
    return board;
  }
  /**
   * Creates a new ConnectFourGame.
   * @param priorGame If provided, the new game will be created such that if either player
   * from the prior game joins, they will be the same color. When the game begins, the default
   * first player is red, but if either player from the prior game joins the new game
   * (and clicks "start"), the first player will be the other color.
   */
  public constructor(priorGame?: ConnectFourGame) {
    super({
      moves: [],
      status: 'WAITING_FOR_PLAYERS',
      firstPlayer: 'Red',
    });
    this.priorGame = priorGame;
  }

  /**
   * Indicates that a player is ready to start the game.
   *
   * Updates the game state to indicate that the player is ready to start the game.
   *
   * If both players are ready, the game will start.
   *
   * The first player (red or yellow) is determined as follows:
   *   - If neither player was in the last game in this area (or there was no prior game), the first player is red.
   *   - If at least one player was in the last game in this area, then the first player will be the other color from last game.
   *   - If a player from the last game *left* the game and then joined this one, they will be treated as a new player (not given the same color by preference).   *
   *
   * @throws InvalidParametersError if the player is not in the game (PLAYER_NOT_IN_GAME_MESSAGE)
   * @throws InvalidParametersError if the game is not in the WAITING_TO_START state (GAME_NOT_STARTABLE_MESSAGE)
   *
   * @param player The player who is ready to start the game
   */
  public startGame(player: Player): void {
    if (this.state.status !== 'WAITING_TO_START') {
      throw new Error(GAME_NOT_STARTABLE_MESSAGE);
    }
    if (this.checkIfPlayerIsInGame(player)) {
      throw new Error(PLAYER_NOT_IN_GAME_MESSAGE);
    }
    if (this.state.red === player.id) {
      this.state.redReady = true;
      this._checkIfPlayersAreReady();
      
    } else if (this.state.yellow === player.id) {
      this.state.yellowReady = true;
      this._checkIfPlayersAreReady();
    }

    if (this.priorGame?.state.red === this.state.red || this.priorGame?.state.yellow === this.state.yellow || 
      this.priorGame?.state.red === this.state.yellow || this.priorGame?.state.yellow === this.state.red) {
      this._switchFirstPlayer();
    } else { // default first player to red
      this.state = {
        ...this.state,
        firstPlayer: 'Red',
      };
    }
  }
  
  private _checkIfPlayersAreReady(): void {
    if (this.state.redReady && this.state.yellowReady) {
      this.state = {
        ...this.state,
        status: 'IN_PROGRESS',
      };
    }
  }

  private _switchFirstPlayer(): void {
    if (this.priorGame?.state.firstPlayer === 'Red') {
      this.state = {
        ...this.state,
        firstPlayer: 'Yellow',
      };
    } else {
      this.state = {
        ...this.state,
        firstPlayer: 'Red',
      };
    }
  }

  /**
   * Joins a player to the game.
   * - Assigns the player to a color (red or yellow). If the player was in the prior game, then attempts
   * to reuse the same color if it is not in use. Otherwise, assigns the player to the first
   * available color (red, then yellow).
   * - If both players are now assigned, updates the game status to WAITING_TO_START.
   *
   * @throws InvalidParametersError if the player is already in the game (PLAYER_ALREADY_IN_GAME_MESSAGE)
   * @throws InvalidParametersError if the game is full (GAME_FULL_MESSAGE)
   *
   * @param player the player to join the game
   */
  protected _join(player: Player): void {
    if (this.state.red === player.id || this.state.yellow === player.id) {
      throw new Error(PLAYER_ALREADY_IN_GAME_MESSAGE);
    }
    if (this.state.red && this.state.yellow) {
      throw new Error(GAME_FULL_MESSAGE);
    }
    this.assignPlayerToColor(player, this.priorGame);
    
    if (this.state.red && this.state.yellow) {
      this.state = {
        ...this.state,
        status: 'WAITING_TO_START'
      };
    }
  }

  private assignPlayerToColor(player: Player, priorGame: ConnectFourGame | undefined): void {
    if (priorGame) {
      if (priorGame.state.red === player.id && !this.state.red) {
        this._assignPlayerToRed(player);
        return;
      } 
      if (priorGame.state.yellow === player.id && !this.state.yellow) {
        this._assignPlayerToYellow(player);
        return;
      }
    }
    if (!this.state.red) { 
      this._assignPlayerToRed(player);
      return;
    } 
    if (!this.state.yellow) {
      this._assignPlayerToYellow(player);
      return;
    }
    throw new Error("Unable to assign player even though game isn't full. Something is seriously wrong.");
  }

  private _assignPlayerToYellow(player: Player): void {
    this.state = {
      ...this.state,
      yellow: player.id,
    };
  }

  private _assignPlayerToRed(player: Player): void {
    this.state = {
      ...this.state,
      red: player.id,
    };
  }

  
  /**
   * Removes a player from the game.
   * Updates the game's state to reflect the player leaving.
   *
   * If the game state is currently "IN_PROGRESS", updates the game's status to OVER and sets the winner to the other player.
   *
   * If the game state is currently "WAITING_TO_START", updates the game's status to WAITING_FOR_PLAYERS.
   *
   * If the game state is currently "WAITING_FOR_PLAYERS" or "OVER", the game state is unchanged.
   *
   * @param player The player to remove from the game
   * @throws InvalidParametersError if the player is not in the game (PLAYER_NOT_IN_GAME_MESSAGE)
   */
  protected _leave(player: Player): void {
    if (this.checkIfPlayerIsInGame(player)) {
      throw new Error(PLAYER_NOT_IN_GAME_MESSAGE);
    }
    if (this.state.status === 'OVER') {
      return;
    }

    if (this.state.red === player.id) {
      this.updateGameStatusOnLeave(player);
      this.state.red = undefined;
      this.state.redReady = false;
    }
    if (this.state.yellow === player.id) {
      this.updateGameStatusOnLeave(player);
      this.state.yellow = undefined;
      this.state.yellowReady = false;
    }
  }

  private updateGameStatusOnLeave(player: Player): void {
    if (this.state.status === 'IN_PROGRESS') {
      this.state = {
        ...this.state,
        winner: this.state.red === player.id ? this.state.yellow : this.state.red,
        status: 'OVER',
      };
    } else if (this.state.status === 'WAITING_TO_START') {
      this.state = {
        ...this.state,
        status: 'WAITING_FOR_PLAYERS',
      };
    }
  }

  /**
   * Applies a move to the game.
   * Uses the player's ID to determine which color they are playing as (ignores move.gamePiece).
   *
   * Validates the move, and if it is valid, applies it to the game state.
   *
   * If the move ends the game, updates the game state to reflect the end of the game,
   * setting the status to "OVER" and the winner to the player who won (or "undefined" if it was a tie)
   *
   * @param move The move to attempt to apply
   *
   * @throws InvalidParametersError if the game is not in progress (GAME_NOT_IN_PROGRESS_MESSAGE)
   * @throws InvalidParametersError if the player is not in the game (PLAYER_NOT_IN_GAME_MESSAGE)
   * @throws INvalidParametersError if the move is not the player's turn (MOVE_NOT_YOUR_TURN_MESSAGE)
   * @throws InvalidParametersError if the move is invalid per the rules of Connect Four (BOARD_POSITION_NOT_VALID_MESSAGE)
   *
   */
  public applyMove(move: GameMove<ConnectFourMove>): void {
    // still need to implement invalid board position. 
    this._validateMove(move);
    this.state = {
      ...this.state,
      moves: [...this.state.moves, move.move],
    };
    this._checkForGameEnding(move.move);
  }
  private _validateMove(move: GameMove<ConnectFourMove>): void {
    if (this.state.status !== 'IN_PROGRESS') {
      throw new Error(GAME_NOT_IN_PROGRESS_MESSAGE);
    }
    if (this.state.red !== move.playerID && this.state.yellow !== move.playerID) {
      throw new Error(PLAYER_NOT_IN_GAME_MESSAGE);
    }
    if (!this._checkTurn(move)) {
      throw new Error(MOVE_NOT_YOUR_TURN_MESSAGE);
    }
    if (!this._checkValidBoardPosition(move)) {
      throw new Error(BOARD_POSITION_NOT_VALID_MESSAGE);
    }
  }

  private _checkValidBoardPosition(move: GameMove<ConnectFourMove>): boolean {
    let row = move.move.row;
    let col = move.move.col;
    // check if move is out of bounds
    if (col < 0 || col >= 7 || row < 0 || row >= 6) {
      return false;
    }
    // check if move is on an empty space
    if (this._board[row][col] !== '') { 
      return false
    }
    // check if there is a piece below the move
    if (row !== 5) {
      if (this._board[row + 1][col] === '') {
        return false
      }
    }
    return true
  }
  private _checkForGameEnding(move: ConnectFourMove): void {
    const board = this._board;
    const NUM_ROWS = 6;
    const NUM_COLS = 7;
    let atleastOneEmptySpace = false;

    // check for win horizontally 
    for (let row = 0; row < NUM_ROWS; row++) {
      for (let col = 0; col < NUM_COLS; col++) {
        if (!board[row]?.[col]) {
          atleastOneEmptySpace = true;
          continue; // Skip empty cells
        }
        const GAME_PIECE = board[row][col];

        // Check horizontal (rightward)
        if (GAME_PIECE === board[row]?.[col + 1] &&
          GAME_PIECE === board[row]?.[col + 2] &&
          GAME_PIECE === board[row]?.[col + 3]) {
            this.state = {
              ...this.state,
              status: 'OVER',
              winner: move.gamePiece === 'Red' ? this.state.red : this.state.yellow,
            };
            return;
        }
        // check vertical
        if (GAME_PIECE === board[row + 1]?.[col] &&
          GAME_PIECE === board[row + 2]?.[col] &&
          GAME_PIECE === board[row + 3]?.[col]) {
            this.state = {
              ...this.state,
              status: 'OVER',
              winner: move.gamePiece === 'Red' ? this.state.red : this.state.yellow,
            };
            return;
        }
        // check diagonal top left to bottom right 
        if (GAME_PIECE === board[row + 1]?.[col + 1] &&
          GAME_PIECE === board[row + 2]?.[col + 2] &&
          GAME_PIECE === board[row + 3]?.[col + 3]) {
            this.state = {
              ...this.state,
              status: 'OVER',
              winner: move.gamePiece === 'Red' ? this.state.red : this.state.yellow,
            };
            return;
        }
        // check diagonal bottom left to top right  
        if (GAME_PIECE === board[row - 1]?.[col + 1] &&
          GAME_PIECE === board[row - 2]?.[col + 2] &&
          GAME_PIECE === board[row - 3]?.[col + 3]) {
            this.state = {
              ...this.state,
              status: 'OVER',
              winner: move.gamePiece === 'Red' ? this.state.red : this.state.yellow,
            };
            return;
        }
        // check for tie
        if (!atleastOneEmptySpace && this.state.moves.length === 42) {
          this.state = {
            ...this.state,
            status: 'OVER',
            winner: undefined,
          };
          return;
        }
      }
    }
  }

  private _checkTurn(move: GameMove<ConnectFourMove>): boolean {
    if (this.state.moves.length === 0) {
      if (this.state.firstPlayer === 'Red') {
        return this.state.red === move.playerID;
      } else {
        return this.state.yellow === move.playerID;
      }
    }
    let mostRecentTurn = this.state.moves[this.state.moves.length - 1].gamePiece;
    if (mostRecentTurn === 'Red') {
      return this.state.yellow === move.playerID;
    } else {
      return this.state.red === move.playerID;
    }
  }

  private checkIfPlayerIsInGame(player: Player): boolean {
    return this.state.red !== player.id && this.state.yellow !== player.id
  }
}
