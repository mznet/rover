import ACTION_TYPE from "../enum/ActionType";

export default interface Payload {
  action: ACTION_TYPE;
  data: string;
  // GET_BOOKMARKS with empty data: list bookmarks with this tag. Omitted,
  // the first tag is used.
  tag?: string;
  // SET_TAGS: the bookmark's new tags.
  tags?: string[];
}
