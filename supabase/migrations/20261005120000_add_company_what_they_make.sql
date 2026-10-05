-- What an account makes or sells, in its own words (e.g. "mille-feuille, opera cake").
--
-- ADDITIVE. One nullable text column, typed or confirmed by Pat. The deal panel's
-- message drafts name it ("I saw … on your menu") so a draft is about that buyer and
-- not a generic bakery. Never inferred silently: a value proposed from the account's
-- website is saved only after Pat approves it.

alter table public.companies add column if not exists what_they_make text;
