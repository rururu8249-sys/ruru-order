-- [읽기 전용] 주문서 합계 final 이 «총액 합 − 포인트 합» 과 다른 주문서 찾기 (포인트 사용 주문서만, 취소 줄 제외)
with g as (
  select order_group_id gid, max(youtube_nickname) nick, max(admin_order_status_v2) st, min(created_at) ct,
         sum(coalesce(adjusted_total_price, total_price, 0)) tot,
         sum(coalesce(point_used_amount, 0)) pt,
         sum(coalesce(final_amount, 0)) fa
    from public.orders
   where coalesce(is_deleted, false) = false
     and coalesce(admin_order_status_v2, '') not like '%취소%'
   group by 1
  having sum(coalesce(point_used_amount, 0)) > 0
)
select nick, to_char(ct at time zone 'Asia/Seoul', 'YY-MM-DD HH24:MI') d, st, tot, pt, fa, fa - greatest(0, tot - pt) diff
  from g
 where fa <> greatest(0, tot - pt)
 order by ct desc;
