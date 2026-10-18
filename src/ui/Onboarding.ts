import type { Game } from '@/core/game';
import { PSEUDO_MAX, pseudoErrorMessage, validatePseudo, type PseudoError } from '@/core/pseudo';
import { backendErrorMessage, type Backend } from '@/services/online/Backend';
import { h } from './dom';
import type { Modals } from './Modals';

/** Champ de saisie avec libellé et message d'aide. */
function field(label: string, input: HTMLInputElement, help: HTMLElement): HTMLElement {
  return h('label', { class: 'field' }, h('span', { class: 'field__label', text: label }), input, help);
}

/**
 * Inscription : choix du pseudo (unique, visible des autres joueurs) et du
 * nom de la ville. Propose aussi de récupérer une ville avec un code de transfert.
 */
export function showPseudoForm(
  modals: Modals,
  backend: Backend,
  game: Game,
  options: { onDone: () => void; onTransfer: (code: string) => Promise<void>; onBack: () => void },
): void {
  const pseudo = h('input', {
    class: 'field__input',
    attrs: {
      maxlength: String(PSEUDO_MAX + 4),
      autocomplete: 'nickname',
      autocapitalize: 'words',
      spellcheck: 'false',
    },
  });
  const city = h('input', {
    class: 'field__input',
    attrs: { maxlength: '30', autocapitalize: 'words', value: game.state.cityName },
  });
  city.value = game.state.cityName === 'Ma ville' ? '' : game.state.cityName;
  city.placeholder = 'Ma ville';
  pseudo.placeholder = 'Ex. : MaireDeLyon';
  const pseudoHelp = h('span', { class: 'field__help', text: 'Visible par vos voisins et dans le classement.' });
  const error = h('p', { class: 'form-error' });
  const submit = h('button', { class: 'btn btn--primary btn--wide', text: 'C’est parti !' });
  submit.disabled = true;

  let checkTimer = 0;
  let lastChecked = '';
  let available = false;
  const describe = (problem: PseudoError | 'taken' | null) => {
    pseudoHelp.classList.toggle('is-bad', problem !== null);
    pseudoHelp.classList.toggle('is-ok', problem === null && available);
    if (problem === 'taken') pseudoHelp.textContent = 'Ce pseudo est déjà pris.';
    else if (problem) pseudoHelp.textContent = pseudoErrorMessage(problem);
    else pseudoHelp.textContent = available ? 'Pseudo disponible !' : 'Vérification…';
  };
  pseudo.addEventListener('input', () => {
    available = false;
    submit.disabled = true;
    window.clearTimeout(checkTimer);
    const value = pseudo.value;
    const local = validatePseudo(value);
    if (local) {
      describe(value.trim().length === 0 ? null : local);
      if (value.trim().length === 0) pseudoHelp.textContent = 'Visible par vos voisins et dans le classement.';
      return;
    }
    describe(null);
    checkTimer = window.setTimeout(() => {
      lastChecked = value;
      backend
        .pseudoAvailable(value)
        .then((result) => {
          if (pseudo.value !== lastChecked) return;
          available = result.available;
          submit.disabled = !available;
          describe(result.available ? null : result.error === 'taken' ? 'taken' : 'forbidden');
        })
        .catch(() => {
          // Hors-ligne : on laisse tenter l'inscription, l'erreur s'affichera.
          available = true;
          submit.disabled = false;
          pseudoHelp.textContent = 'Impossible de vérifier pour le moment.';
        });
    }, 350);
  });

  submit.addEventListener('click', () => {
    submit.disabled = true;
    error.textContent = '';
    const cityName = city.value.trim() || 'Ma ville';
    backend
      .register(pseudo.value, cityName)
      .then(() => {
        game.setCityName(cityName);
        modals.close();
        options.onDone();
      })
      .catch((e: unknown) => {
        error.textContent = backendErrorMessage(e);
        submit.disabled = false;
      });
  });

  const transfer =
    backend.kind === 'convex'
      ? h('button', {
          class: 'link-btn',
          text: 'J’ai déjà une ville (code de transfert)',
          onClick: () => {
            modals.close();
            setTimeout(() => showTransferForm(modals, options), 220);
          },
        })
      : null;

  modals.show({
    title: 'Bienvenue, Maire !',
    kicker: 'Votre compte',
    avatar: true,
    dismissible: false,
    urgent: true,
    className: 'modal--form',
    body: [
      h('p', { text: 'Choisissez votre pseudo et donnez un nom à votre ville.' }),
      field('Pseudo', pseudo, pseudoHelp),
      field('Nom de la ville', city, h('span', { class: 'field__help', text: '30 caractères maximum.' })),
      error,
      submit,
      transfer,
    ],
    buttons: [],
  });
  setTimeout(() => pseudo.focus(), 250);
}

function showTransferForm(
  modals: Modals,
  options: { onDone: () => void; onTransfer: (code: string) => Promise<void>; onBack: () => void },
): void {
  const code = h('input', {
    class: 'field__input field__input--code',
    attrs: { maxlength: '14', autocapitalize: 'characters', spellcheck: 'false', autocomplete: 'one-time-code' },
  });
  code.placeholder = 'ABCD-EFGH-JKLM';
  const error = h('p', { class: 'form-error' });
  const submit = h('button', { class: 'btn btn--primary btn--wide', text: 'Récupérer ma ville' });
  submit.addEventListener('click', () => {
    submit.disabled = true;
    error.textContent = '';
    options.onTransfer(code.value).catch((e: unknown) => {
      error.textContent = backendErrorMessage(e);
      submit.disabled = false;
    });
  });
  modals.show({
    title: 'Récupérer ma ville',
    kicker: 'Code de transfert',
    dismissible: false,
    urgent: true,
    className: 'modal--form',
    body: [
      h('p', {
        text: 'Sur votre ancien appareil : Réglages › Compte › « Code de transfert ». Le code est valable 24 heures.',
      }),
      field('Code', code, h('span', { class: 'field__help', text: '12 lettres et chiffres.' })),
      error,
      submit,
      h('button', {
        class: 'link-btn',
        text: '← Créer un nouveau compte',
        onClick: () => {
          modals.close();
          options.onBack();
        },
      }),
    ],
    buttons: [],
  });
}
