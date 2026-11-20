-- Love Birds: pick the chime your phone plays.
-- Run this in the Supabase SQL Editor after plan-icons.sql. It is safe to run more than once.

-- chime: the sound this person's phone plays for Love Birds notifications (src/lib/chimes.ts).
-- Null or 'love' is the original chime.
alter table public.profiles add column if not exists chime text;
alter table public.profiles drop constraint if exists profiles_chime;
alter table public.profiles add constraint profiles_chime check (chime is null or chime ~ '^[a-z0-9_]{1,30}$');
grant update (chime) on public.profiles to authenticated;

-- Android fixes a notification channel's sound when the channel is made, so each chime has its
-- own channel: 'love' for the original and 'love-<chime>' for the rest. The app makes the channel
-- for your chime before saving it here, so the phone always has the channel this sends through.
create or replace function public.push_to(p_token text, p_title text, p_body text, p_url text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_chime text;
begin
  if p_token is null or p_token = '' then return; end if;
  -- A failure never blocks the change that caused the notification.
  begin
    select chime into v_chime from public.profiles where push_token = p_token limit 1;
    v_chime := coalesce(nullif(v_chime, ''), 'love');
    perform net.http_post(
      url := 'https://exp.host/--/api/v2/push/send',
      body := jsonb_build_object(
        'to', p_token,
        'title', p_title,
        'body', p_body,
        'channelId', case when v_chime = 'love' then 'love' else 'love-' || v_chime end,
        'priority', 'high',
        'data', jsonb_build_object('url', p_url)
      ) || case v_chime
        when 'love' then jsonb_build_object('sound', 'love.wav')
        when 'phone' then jsonb_build_object('sound', 'default')
        when 'none' then '{}'::jsonb
        else jsonb_build_object('sound', v_chime || '.mp3')
      end,
      headers := '{"Content-Type": "application/json", "Accept": "application/json"}'::jsonb
    );
  exception when others then
    raise warning 'Love Birds push failed: %', sqlerrm;
  end;
end $$;

revoke execute on function public.push_to(text, text, text, text) from public, anon, authenticated;

-- So the app can save chimes straight away.
notify pgrst, 'reload schema';
