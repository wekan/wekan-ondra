const activitiesPerPage = 20;

BlazeComponent.extendComponent({
  onCreated() {
    // XXX Should we use ReactiveNumber?
    this.page = new ReactiveVar(1);
    this.loadNextPageLocked = false;
    const sidebar = this.parentComponent(); // XXX for some reason not working
    sidebar.callFirstWith(null, 'resetNextPeak');
    this.autorun(() => {
      let mode = this.data().mode;
      const capitalizedMode = Utils.capitalize(mode);
      let thisId, searchId;
      if (mode === 'linkedcard' || mode === 'linkedboard') {
        thisId = Session.get('currentCard');
        searchId = Cards.findOne({ _id: thisId }).linkedId;
        mode = mode.replace('linked', '');
      } else {
        thisId = Session.get(`current${capitalizedMode}`);
        searchId = thisId;
      }
      const limit = this.page.get() * activitiesPerPage;
      const user = Meteor.user();
      const hideSystem = user ? user.hasHiddenSystemMessages() : false;
      if (searchId === null) return;

      this.subscribe('activities', mode, searchId, limit, hideSystem, () => {
        this.loadNextPageLocked = false;

        // If the sibear peak hasn't increased, that mean that there are no more
        // activities, and we can stop calling new subscriptions.
        // XXX This is hacky! We need to know excatly and reactively how many
        // activities there are, we probably want to denormalize this number
        // dirrectly into card and board documents.
        const nextPeakBefore = sidebar.callFirstWith(null, 'getNextPeak');
        sidebar.calculateNextPeak();
        const nextPeakAfter = sidebar.callFirstWith(null, 'getNextPeak');
        if (nextPeakBefore === nextPeakAfter) {
          sidebar.callFirstWith(null, 'resetNextPeak');
        }
      });
    });
  },
}).register('activities');

BlazeComponent.extendComponent({
  loadNextPage() {
    if (this.loadNextPageLocked === false) {
      this.page.set(this.page.get() + 1);
      this.loadNextPageLocked = true;
    }
  },

  checkItem() {
    const checkItemId = this.currentData().activity.checklistItemId;
    const checkItem = ChecklistItems.findOne({ _id: checkItemId });
    return checkItem && checkItem.title;
  },

  boardLabel() {
    const data = this.currentData();
    if (data.mode !== 'board') {
      return createBoardLink(data.activity.board(), data.activity.listName);
    }
    return TAPi18n.__('this-board');
  },

  cardLabel() {
    const data = this.currentData();
    if (data.mode !== 'card') {
      return createCardLink(this.currentData().activity.card());
    }
    return TAPi18n.__('this-card');
  },

  cardLink() {
    return createCardLink(this.currentData().activity.card());
  },

  lastLabel() {
    const lastLabelId = this.currentData().activity.labelId;
    if (!lastLabelId) return null;
    const lastLabel = Boards.findOne(
      this.currentData().activity.boardId,
    ).getLabelById(lastLabelId);
    if (lastLabel && (lastLabel.name === undefined || lastLabel.name === '')) {
      return lastLabel.color;
    } else {
      return lastLabel.name;
    }
  },

  lastCustomField() {
    const lastCustomField = CustomFields.findOne(
      this.currentData().activity.customFieldId,
    );
    if (!lastCustomField) return null;
    return lastCustomField.name;
  },

  lastCustomFieldValue() {
    const lastCustomField = CustomFields.findOne(
      this.currentData().activity.customFieldId,
    );
    if (!lastCustomField) return null;
    const value = this.currentData().activity.value;
    if (
      lastCustomField.settings.dropdownItems &&
      lastCustomField.settings.dropdownItems.length > 0
    ) {
      const dropDownValue = _.find(
        lastCustomField.settings.dropdownItems,
        item => {
          return item._id === value;
        },
      );
      if (dropDownValue) return dropDownValue.name;
    }
    return value;
  },

  listLabel() {
    const activity = this.currentData().activity;
    const list = activity.list();
    return (list && list.title) || activity.title;
  },

  sourceLink() {
    const source = this.currentData().activity.source;
    if (source) {
      if (source.url) {
        return Blaze.toHTML(
          HTML.A(
            {
              href: source.url,
            },
            source.system,
          ),
        );
      } else {
        return source.system;
      }
    }
    return null;
  },

  memberLink() {
    return Blaze.toHTMLWithData(Template.memberName, {
      user: this.currentData().activity.member(),
    });
  },

  attachmentLink() {
    const attachment = this.currentData().activity.attachment();
    // trying to display url before file is stored generates js errors
    return (
      (attachment &&
        attachment.url({ download: true }) &&
        Blaze.toHTML(
          HTML.A(
            {
              href: attachment.url({ download: true }),
              target: '_blank',
            },
            attachment.name(),
          ),
        )) ||
      this.currentData().activity.attachmentName
    );
  },

  customField() {
    const customField = this.currentData().activity.customField();
    if (!customField) return null;
    return customField.name;
  },

  events() {
    return [
      {
        // XXX We should use Popup.afterConfirmation here
        'click .js-delete-comment'() {
          const commentId = this.currentData().activity.commentId;
          CardComments.remove(commentId);
        },
        'submit .js-edit-comment'(evt) {
          evt.preventDefault();
          const commentText = this.currentComponent()
            .getValue()
            .trim();
          const commentId = Template.parentData().activity.commentId;
          if (commentText) {
            CardComments.update(commentId, {
              $set: {
                text: commentText,
              },
            });
          }
        },
      },
    ];
  },
}).register('activity');

function createCardLink(card) {
  return (
    card &&
    Blaze.toHTML(
      HTML.A(
        {
          href: card.absoluteUrl(),
          class: 'action-card',
        },
        card.title,
      ),
    )
  );
}

function createBoardLink(board, list) {
  let text = board.title;
  if (list) text += `: ${list}`;
  return (
    board &&
    Blaze.toHTML(
      HTML.A(
        {
          href: board.absoluteUrl(),
          class: 'action-board',
        },
        text,
      ),
    )
  );
}
