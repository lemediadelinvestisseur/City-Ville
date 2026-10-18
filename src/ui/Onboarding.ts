import type { Game } from '@/core/game';
import { PSEUDO_MAX, validatePseudo, type PseudoError } from '@/core/pseudo';
import { LANGUAGES } from '@/data/languages';
import { availableLanguages, language, t, type Language } from '@/i18n';
import type { Backend } from '@/services/online/Backend';
import { h, icon } from './dom';
import { Icons } from './icons';
import { backendErrorMessage, pseudoErrorMessage } from './messages';
import type { Modals } from './Modals';

/** Champ de saisie avec libellé et message d'aide. */
function field(label: string, input: HTMLInputElement, help: HTMLElement): HTMLElement {
  return h('label', { class: 'field' }, h('span', { class: 'field__label', text: label }), input, help);
}

export function languageName(code: string): string {
  return LANGUAGES.find((l) => l.code === code)?.name ?? code;
}

/**
 * Choix de la langue (première ouverture, puis depuis les réglages). Chaque
 * langue est écrite dans sa propre langue ; la langue actuelle est mise en avant.
 */
export function showLanguagePicker(
  modals: Modals,
  options: { onPick: (code: Language) => void; dismissible: boolean; title?: string },
): void {
  const current = language();
  const grid = h(
    'div',
    { class: 'languages', attrs: { role: 'listbox' } },
    ...availableLanguages().map((code) =>
      h('button', {
        class: `language${code === current ? ' is-current' : ''}`,
        text: languageName(code),
        attrs: { lang: code, role: 'option', 'aria-selected': String(code === current) },
        onClick: () => {
          modals.close();
          options.onPick(code);
        },
      }),
    ),
  );
  modals.show({
    title: options.title ?? t('lang.title'),
    kicker: t('lang.kicker'),
    dismissible: options.dismissible,
    urgent: true,
    className: 'modal--languages',
    body: [h('div', { class: 'language-globe' }, icon(Icons.globe)), h('p', { text: t('lang.body') }), grid],
    buttons: [],
  });
}

/**
 * Inscription : choix du pseudo (unique, visible des autres joueurs) et du
 * nom de la ville. Propose aussi de changer de langue et de récupérer une ville
 * avec un code de transfert.
 */
export function showPseudoForm(
  modals: Modals,
  backend: Backend,
  game: Game,
  options: {
    onDone: () => void;
    onTransfer: (code: string) => Promise<void>;
    onBack: () => void;
    onChangeLanguage: () => void;
  },
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
  const defaultCity = t('signup.cityPlaceholder');
  const city = h('input', { class: 'field__input', attrs: { maxlength: '30', autocapitalize: 'words' } });
  city.value = game.state.cityName === 'Ma ville' ? '' : game.state.cityName;
  city.placeholder = defaultCity;
  pseudo.placeholder = t('signup.pseudoPlaceholder');
  const pseudoHelp = h('span', { class: 'field__help', text: t('signup.pseudoHelp') });
  const error = h('p', { class: 'form-error' });
  const submit = h('button', { class: 'btn btn--primary btn--wide', text: t('signup.go') });
  submit.disabled = true;

  let checkTimer = 0;
  let lastChecked = '';
  let available = false;
  const describe = (problem: PseudoError | 'taken' | null) => {
    pseudoHelp.classList.toggle('is-bad', problem !== null);
    pseudoHelp.classList.toggle('is-ok', problem === null && available);
    if (problem) pseudoHelp.textContent = pseudoErrorMessage(problem);
    else pseudoHelp.textContent = available ? t('signup.available') : t('signup.checking');
  };
  pseudo.addEventListener('input', () => {
    available = false;
    submit.disabled = true;
    window.clearTimeout(checkTimer);
    const value = pseudo.value;
    const local = validatePseudo(value);
    if (local) {
      describe(value.trim().length === 0 ? null : local);
      if (value.trim().length === 0) pseudoHelp.textContent = t('signup.pseudoHelp');
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
          pseudoHelp.textContent = t('signup.cantCheck');
        });
    }, 350);
  });

  submit.addEventListener('click', () => {
    submit.disabled = true;
    error.textContent = '';
    const cityName = city.value.trim() || defaultCity;
    backend
      .register(pseudo.value, cityName, language())
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
          text: t('signup.haveCity'),
          onClick: () => {
            modals.close();
            setTimeout(() => showTransferForm(modals, options), 220);
          },
        })
      : null;
  const changeLanguage = h(
    'button',
    {
      class: 'link-btn link-btn--language',
      onClick: () => {
        modals.close();
        setTimeout(options.onChangeLanguage, 220);
      },
    },
    icon(Icons.globe),
    ` ${t('signup.language', { language: languageName(language()) })}`,
  );

  modals.show({
    title: t('signup.title'),
    kicker: t('signup.kicker'),
    avatar: true,
    dismissible: false,
    urgent: true,
    className: 'modal--form',
    body: [
      h('p', { text: t('signup.body') }),
      field(t('signup.pseudo'), pseudo, pseudoHelp),
      field(t('signup.city'), city, h('span', { class: 'field__help', text: t('signup.cityHelp') })),
      error,
      submit,
      transfer,
      changeLanguage,
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
  const submit = h('button', { class: 'btn btn--primary btn--wide', text: t('transfer.submit') });
  submit.addEventListener('click', () => {
    submit.disabled = true;
    error.textContent = '';
    options.onTransfer(code.value).catch((e: unknown) => {
      error.textContent = backendErrorMessage(e);
      submit.disabled = false;
    });
  });
  modals.show({
    title: t('transfer.title'),
    kicker: t('transfer.kicker'),
    dismissible: false,
    urgent: true,
    className: 'modal--form',
    body: [
      h('p', { text: t('transfer.body') }),
      field(t('transfer.code'), code, h('span', { class: 'field__help', text: t('transfer.help') })),
      error,
      submit,
      h('button', {
        class: 'link-btn',
        text: t('transfer.back'),
        onClick: () => {
          modals.close();
          options.onBack();
        },
      }),
    ],
    buttons: [],
  });
}
