import ACTION_TYPE from "../enum/ActionType";

export default interface Payload {
  action: ACTION_TYPE;
  data: string;
}
