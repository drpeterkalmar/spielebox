// Computer-Gegner je Spiel und Rechenzeit je Stufe – gemeinsam für Hauptthread (botclient.js) und Worker (botworker.js).
import { chooseMove as muehle } from './muehle/bot.js';
import { chooseMove as dame } from './dame/bot.js';
import { chooseMove as schach } from './schach/bot.js';
import { chooseMove as schnapsen } from './schnapsen/bot.js';
import { chooseMove as backgammon } from './backgammon/bot.js';
import { chooseMove as blackjack } from './blackjack/bot.js';
import { chooseMove as halma } from './halma/bot.js';
import { chooseMove as ludo } from './ludo/bot.js';
import { chooseMove as schiffe } from './schiffe/bot.js';
import { chooseMove as vier } from './vier/bot.js';
import { chooseMove as maumau } from './maumau/bot.js';
import { chooseMove as wuerfel } from './wuerfel/bot.js';
import { chooseMove as reversi } from './reversi/bot.js';
import { chooseMove as paare } from './paare/bot.js';
import { chooseMove as holdem } from './holdem/bot.js';

export const BOTS = { muehle, dame, schach, schnapsen, backgammon, blackjack, halma, ludo, schiffe, vier, maumau, wuerfel, reversi, paare, holdem };
export const TIME = { 1: 150, 2: 400, 3: 1200 };
