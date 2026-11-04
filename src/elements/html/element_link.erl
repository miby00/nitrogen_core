% vim: ts=4 sw=4 et
% Nitrogen Web Framework for Erlang
% Copyright (c) 2008-2010 Rusty Klophaus
% See MIT-LICENSE for licensing information.

-module (element_link).
-include("wf.hrl").
-export([
    reflect/0,
    render_element/1
]).

-spec reflect() -> [atom()].
reflect() -> record_info(fields, link).

-spec render_element(#link{}) -> body().
render_element(Record = #link{}) -> 
    ID = Record#link.id,
    Anchor = Record#link.anchor,
    case Record#link.postback of
        undefined -> ignore;
        Postback -> wf:wire(Anchor, #event {
                    type=click,
                    postback=Postback,
                    vessel=Record#link.vessel,
                    validation_group=ID,
                    handle_invalid=Record#link.handle_invalid,
                    on_invalid=Record#link.on_invalid,
                    delegate=Record#link.delegate })
    end,

	case Record#link.click of
		undefined -> ignore;
		ClickActions -> wf:wire(Anchor, #event{type=click, actions=ClickActions })
	end,

    Image = image(Record#link.image),
    Icon = icon(Record#link.icon),
    HasIcon = not(?WF_BLANK(Image)) orelse not(?WF_BLANK(Icon)),
    Body = [
        ?WF_IF(HasIcon, [Image, Icon]),
        wf:html_encode(Record#link.text, Record#link.html_encode),
        Record#link.body
    ],

    Target = ?WF_IF(Record#link.new,<<"_blank">>,""),

    wf_tags:emit_tag(a, Body, [
        {id, Record#link.html_id},
        {href, wf:to_list(Record#link.url)},
        {class, ?ADD_ELEMENT_CLASS(link, Record#link.class)},
        {target, Target},
        {style, Record#link.style},
        {title, wf:html_encode(Record#link.title, Record#link.html_encode)},
        {data_fields, Record#link.data_fields},
        {aria, Record#link.aria}
    ]).

image(X) when ?WF_BLANK(X) ->
    "";
image(X) when is_tuple(X) ->
    X;
image(X) ->
    #image{image=X, class=link_icon}.

icon(X) when ?WF_BLANK(X) ->
    "";
icon(X) when is_tuple(X) ->
    X;
icon(X) ->
    #icon{icon=X, class=link_icon}.
